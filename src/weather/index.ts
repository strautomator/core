// Strautomator Core: Weather

import {ActivityWeather, WeatherProvider, WeatherSummary} from "./types"
import {apiRateLimiter} from "./utils"
import {StravaActivity} from "../strava/types"
import {UserPreferences} from "../users/types"
import tomorrow from "./tomorrow"
import openweathermap from "./openweathermap"
import stormglass from "./stormglass"
import visualcrossing from "./visualcrossing"
import weatherapi from "./weatherapi"
import weatherbit from "./weatherbit"
import _ = require("lodash")
import cache = require("bitecache")
import logger = require("anyhow")
import dayjs from "../dayjs"
const settings = require("setmeup").settings

/**
 * Weather APIs wrapper.
 */
export class Weather {
    private constructor() {}
    private static _instance: Weather
    static get Instance(): Weather {
        return this._instance || (this._instance = new this())
    }

    /**
     * List of weather providers (as modules).
     */
    providers: WeatherProvider[] = []

    /**
     * Helper property to return an empty summary.
     */
    get emptySummary() {
        const emptySummary: WeatherSummary = {
            summary: "",
            icon: "",
            temperature: "",
            feelsLike: "",
            humidity: "",
            pressure: "",
            windSpeed: "",
            windDirection: "" as any,
            precipitation: "",
            cloudCover: "",
            moon: "" as any
        }

        return emptySummary
    }

    // INIT
    // --------------------------------------------------------------------------

    /**
     * Init the Weather wrapper.
     */
    init = async (): Promise<void> => {
        try {
            const all: WeatherProvider[] = [stormglass, tomorrow, weatherapi, openweathermap, visualcrossing, weatherbit]

            // Iterate and init the weather providers.
            for (let provider of all) {
                const pSettings = settings.weather[provider.name]

                // Disable via settings? Go to next.
                if (pSettings.disabled) {
                    logger.warn("Weather.init", `Provider ${provider.name} disabled on settings`)
                    continue
                }

                // Check if the API secret was set.
                if (!pSettings.secret) {
                    logger.error("Weather.init", `Missing the weather.${provider.name}.secret on settings`)
                    continue
                }

                // Set the API rate limiting object and stats.
                provider.apiRequest = apiRateLimiter(provider, pSettings.rateLimit)
                provider.stats = {requestCount: 0, errorCount: 0, lastRequest: null}

                this.providers.push(provider)
            }

            cache.setup("weather", settings.weather.cacheDuration)
            logger.info("Weather.init", `Loaded ${this.providers.length} providers`)
        } catch (ex) {
            logger.error("Weather.init", ex)
        }
    }

    // METHODS
    // --------------------------------------------------------------------------

    /**
     * Return the weather for the specified activity.
     * @param activity The Strava activity.
     * @param user The user requesting a weather report.
     * @param provider Optional, the preferred weather provider.
     */
    getActivityWeather = async (activity: StravaActivity, preferences: UserPreferences, provider?: string): Promise<ActivityWeather> => {
        try {
            if (!activity.locationStart && !activity.locationEnd) {
                throw new Error(`No location data for activity ${activity.id}`)
            }

            // Fetch weather for the start and end locations of the activity.
            let weather: ActivityWeather = {}
            try {
                weather.start = await this.getLocationWeather(activity.locationStart, activity.dateStart, preferences)
                weather.end = await this.getLocationWeather(activity.locationEnd, activity.dateEnd, preferences)
            } catch (ex) {
                logger.warn("Weather.getActivityWeather", `Activity ${activity.id}`, `Provider ${provider} failed, will try another`)
            }

            // Make sure weather result is valid.
            if (!weather.start && !weather.end) {
                throw new Error(`Can't get weather for activity ${activity.id}`)
            }

            const startSummary = weather.start ? `Start: ${weather.start.summary}` : "No weather for start location"
            const endSummary = weather.end ? `End: ${weather.end.summary}` : "No weather for end location"
            logger.info("Weather.getActivityWeather", `Activity ${activity.id}`, startSummary, endSummary)

            return weather
        } catch (ex) {
            logger.error("Weather.getActivityWeather", `Activity ${activity.id}`, ex)
            return null
        }
    }

    /**
     * Gets the weather for a given location and date.
     * @param coordinates Array with lat / long coordinates.
     * @param date The weather date.
     * @param user THe user requesting the weather.
     * @param provider Optional preferred weather provider.
     */
    getLocationWeather = async (coordinates: [number, number], date: Date, preferences: UserPreferences, provider?: string): Promise<WeatherSummary> => {
        if (!coordinates || !date) return null

        let result: WeatherSummary
        let providerModule: WeatherProvider

        // Get provider from parameter, then preferences, finally the default from settings.
        if (!provider) {
            const defaultProvider = _.sample(settings.weather.defaultProviders)
            provider = preferences && preferences.weatherProvider ? preferences.weatherProvider : defaultProvider
        }

        // Look on cache first.
        const cacheId = `${coordinates.join("-")}-${date.valueOf() / 1000}`
        const cached: WeatherSummary = cache.get(`weather`, cacheId)
        if (cached && cached.provider == provider) {
            logger.info("Weather.getLocationWeather", coordinates.join(", "), date, `From cache: ${cached.provider}`)
            return cached
        }

        const mDate = dayjs.utc()
        const hours = mDate.diff(date, "hours")
        const isoDate = date.toISOString()
        const latlon = coordinates.join(", ")

        // Get providers that accept the given date and are under the daily usage quota.
        const availableProviders = this.providers.filter((p: WeatherProvider) => p.maxHours >= hours && (p.stats.requestCount < settings.weather[p.name].rateLimit.perDay || mDate.diff(p.stats.lastRequest, "hours") >= 20))

        // No providers available at the moment? Stop here.
        if (availableProviders.length == 0) {
            logger.error("Weather.getLocationWeather", latlon, isoDate, "No weather providers available at the moment")
            return null
        }

        // First try using the preferred or user's default provider.
        // If the default provider is not valid, get the first one available.
        try {
            const foundProviders = _.remove(availableProviders, {name: provider})
            providerModule = foundProviders && foundProviders.length > 0 ? foundProviders[0] : availableProviders.shift()

            result = await providerModule.getWeather(coordinates, date, preferences)
        } catch (ex) {
            const failedProviderName = providerModule.name
            providerModule = _.sample(availableProviders)

            if (providerModule) {
                logger.warn("Weather.getLocationWeather", latlon, isoDate, `${failedProviderName} failed, will try ${providerModule.name}`)

                // Try again using another provider. If also failed, log both exceptions.
                try {
                    result = await providerModule.getWeather(coordinates, date, preferences)
                } catch (retryEx) {
                    logger.error("Weather.getLocationWeather", latlon, isoDate, failedProviderName, ex)
                    logger.error("Weather.getLocationWeather", latlon, isoDate, providerModule.name, retryEx)
                    return null
                }
            } else {
                logger.error("Weather.getLocationWeather", latlon, isoDate, failedProviderName, ex)
            }
        }

        cache.set(`weather`, cacheId, result)
        logger.debug("Weather.getLocationWeather", latlon, isoDate, result.summary)
        return result
    }
}

// Exports...
export default Weather.Instance
