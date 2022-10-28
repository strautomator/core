// Strautomator Core: Weather

import {ActivityWeather, WeatherProvider, WeatherSummary} from "./types"
import {apiRateLimiter} from "./utils"
import {StravaActivity} from "../strava/types"
import {UserData} from "../users/types"
import tomorrow from "./tomorrow"
import openmeteo from "./openmeteo"
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
     * How far back in time can we get weather data?
     */
    maxHoursPast: number = 0

    /**
     * How far in the future can we get weather forecasts for?
     */
    maxHoursFuture: number = 0

    // INIT
    // --------------------------------------------------------------------------

    /**
     * Init the Weather wrapper.
     */
    init = async (): Promise<void> => {
        try {
            const all: WeatherProvider[] = [stormglass, tomorrow, weatherapi, openmeteo, openweathermap, visualcrossing, weatherbit]

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

                // Set the API rate limiting object and stats and add provider.
                provider.apiRequest = apiRateLimiter(provider, pSettings.rateLimit)
                provider.stats = {requestCount: 0, errorCount: 0, lastRequest: null}
                this.providers.push(provider)

                if (provider.hoursPast > this.maxHoursPast) {
                    this.maxHoursPast = provider.hoursPast
                }
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
     * Exceptions won't be thrown, will return null instead.
     * @param user The user requesting a weather report.
     * @param activity The Strava activity.
     */
    getActivityWeather = async (user: UserData, activity: StravaActivity): Promise<ActivityWeather> => {
        try {
            if (!activity.hasLocation) {
                logger.warn("Weather.getActivityWeather", `User ${user.id} ${user.displayName}`, `Activity ${activity.id}`, "No start / end location, can't fetch weather")
                return null
            }

            // Stop right here if activity happened too long ago.
            const minDate = dayjs.utc().subtract(this.maxHoursPast, "hours")
            if (minDate.isAfter(activity.dateEnd)) {
                logger.warn("Weather.getActivityWeather", `User ${user.id} ${user.displayName}`, `Activity ${activity.id}`, `Happened before ${minDate.format("YY-MM-DD HH:mm")}, can't fetch weather`)
                return null
            }

            // Fetch weather for the start and end locations of the activity.
            let weather: ActivityWeather = {}
            try {
                weather.start = await this.getLocationWeather(user, activity.locationStart, activity.dateStart)
                weather.end = await this.getLocationWeather(user, activity.locationEnd, activity.dateEnd)
            } catch (ex) {
                logger.error("Weather.getActivityWeather", `Activity ${activity.id}`, `User ${user.id} ${user.displayName}`, ex)
            }

            // Make sure weather result is valid.
            if (!weather.start && !weather.end) {
                throw new Error("Failed to get the activity weather")
            }

            const startSummary = weather.start ? `Start: ${weather.start.summary}` : "No weather for start location"
            const endSummary = weather.end ? `End: ${weather.end.summary}` : "No weather for end location"
            logger.info("Weather.getActivityWeather", `User ${user.id} ${user.displayName}`, `Activity ${activity.id}`, startSummary, endSummary)

            return weather
        } catch (ex) {
            logger.error("Weather.getActivityWeather", `User ${user.id} ${user.displayName}`, `Activity ${activity.id}`, ex)
            return null
        }
    }

    /**
     * Gets the weather for a given location and date.
     * @param user The user requesting the weather.
     * @param coordinates Array with lat / long coordinates.
     * @param date The weather date.
     * @param provider Optional preferred weather provider.
     */
    getLocationWeather = async (user: UserData, coordinates: [number, number], date: Date, provider?: string): Promise<WeatherSummary> => {
        if (!date || !coordinates || coordinates.length != 2 || isNaN(coordinates[0]) || isNaN(coordinates[1])) {
            const coordinatesLog = coordinates ? coordinates.join(", ") : "no coordinates"
            const dateLog = date ? dayjs(date).format("YYYY-MM-DD HH:mm") : "no date"
            logger.warn("Weather.getLocationWeather", coordinatesLog, dateLog, "Missing coordinates or date, won't fetch")
            return null
        }

        let result: WeatherSummary
        let providerModule: WeatherProvider
        let isDefaultProvider: boolean = false

        const preferences = user.preferences
        const logDate = dayjs(date).format("YYYY-MM-DD HH:mm")
        const mDate = dayjs.utc()
        const hours = mDate.diff(date, "hours")
        const latlon = coordinates.join(", ")

        // Get provider from parameter, then preferences, finally the default from settings.
        if (!provider) {
            const defaultProvider = _.sample(settings.weather.defaultProviders)
            provider = preferences && preferences.weatherProvider ? preferences.weatherProvider : defaultProvider
            isDefaultProvider = true
        }

        // Look on cache first.
        const cacheId = `${coordinates.join("-")}-${date.valueOf() / 1000}`
        const cached: WeatherSummary = cache.get(`weather`, cacheId)
        if (cached && (isDefaultProvider || cached.provider == provider)) {
            logger.info("Weather.getLocationWeather.fromCache", latlon, logDate, cached.provider, cached.summary)
            return cached
        }

        // Get providers that accept the given date and are under the daily usage quota.
        const availableProviders = this.providers.filter((p) => {
            if (p.hoursPast < hours) return false
            if (p.hoursFuture < hours * -1) return false
            if (p.disabledTillDate && mDate.isBefore(p.disabledTillDate)) return false
            return p.stats.requestCount < settings.weather[p.name].rateLimit.perDay || mDate.diff(p.stats.lastRequest, "hours") > 16
        })

        // No providers available at the moment? Stop here.
        if (availableProviders.length == 0) {
            logger.warn("Weather.getLocationWeather", latlon, logDate, "No weather providers available for that query")
            return null
        }

        let currentProviders: WeatherProvider[]

        // First try using the preferred or user's default provider.
        // If the default provider is not valid, get random ones.
        try {
            currentProviders = _.remove(availableProviders, {name: provider})

            if (currentProviders.length > 0) {
                currentProviders.push(_.sample(availableProviders))
            } else {
                currentProviders = _.sampleSize(availableProviders, 2)
            }

            providerModule = currentProviders[0]
            result = await providerModule.getWeather(coordinates, date, preferences)

            if (!result) {
                throw new Error("No weather summary returned")
            }

            providerModule.disabledTillDate = null
        } catch (ex) {
            const failedProviderName = providerModule.name

            if (ex.response && ex.response.status == 402) {
                providerModule.disabledTillDate = dayjs.utc().endOf("day").add(1, "hour").toDate()
                logger.warn("Weather.getLocationWeather", `${failedProviderName} daily quota reached`)
            }

            // Has a second alternative? Try again.
            if (currentProviders.length > 1) {
                providerModule = currentProviders[1]

                logger.warn("Weather.getLocationWeather", `User ${user.id} ${user.displayName}`, latlon, logDate, `${failedProviderName} failed, will try ${providerModule.name}`)

                // Try again using another provider. If also failed, log both exceptions.
                try {
                    result = await providerModule.getWeather(coordinates, date, preferences)
                } catch (retryEx) {
                    logger.error("Weather.getLocationWeather", `User ${user.id} ${user.displayName}`, latlon, logDate, failedProviderName, ex)
                    logger.error("Weather.getLocationWeather", `User ${user.id} ${user.displayName}`, latlon, logDate, providerModule.name, retryEx)
                    return null
                }
            } else {
                logger.error("Weather.getLocationWeather", `User ${user.id} ${user.displayName}`, latlon, logDate, failedProviderName, ex)
            }
        }

        cache.set(`weather`, cacheId, result)
        logger.info("Weather.getLocationWeather", `User ${user.id} ${user.displayName}`, latlon, logDate, result.provider, result.summary)
        return result
    }
}

// Exports...
export default Weather.Instance
