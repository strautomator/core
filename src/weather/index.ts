// Strautomator Core: Weather

import {ActivityWeather, WeatherProvider, WeatherRequestOptions, WeatherSummary} from "./types"
import {apiRateLimiter, processWeatherSummary, weatherSummaryString} from "./utils"
import {StravaActivity} from "../strava/types"
import {UserData} from "../users/types"
import tomorrow from "./tomorrow"
import openmeteo from "./openmeteo"
import openweathermap from "./openweathermap"
import stormglass from "./stormglass"
import visualcrossing from "./visualcrossing"
import weatherapi from "./weatherapi"
import _ from "lodash"
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
            const all: WeatherProvider[] = [stormglass, tomorrow, weatherapi, openmeteo, openweathermap, visualcrossing]

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
                provider.stats = {requestCount: 0, errorCount: 0, repeatedErrors: 0, lastRequest: null}
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
     * @param aqi Also get air quality data?
     */
    getActivityWeather = async (user: UserData, activity: StravaActivity, aqi: boolean): Promise<ActivityWeather> => {
        try {
            if (!activity.hasLocation) {
                logger.warn("Weather.getActivityWeather", `User ${user.id} ${user.displayName}`, `Activity ${activity.id}`, "No start / end location, can't fetch weather")
                return null
            }

            // Stop right here if activity happened too long ago.
            const minDate = dayjs.utc().subtract(this.maxHoursPast, "hours")
            if (minDate.isAfter(activity.dateEnd)) {
                logger.warn("Weather.getActivityWeather", `User ${user.id} ${user.displayName}`, `Activity ${activity.id}`, `Happened before ${minDate.format("lll")}, can't fetch weather`)
                return null
            }

            const dateStart = dayjs(activity.dateStart).utcOffset(activity.utcStartOffset)
            const dateEnd = dayjs(activity.dateStart).utcOffset(activity.utcStartOffset)

            // Fetch weather for the start and end locations of the activity.
            let weather: ActivityWeather = {}
            try {
                weather.start = await this.getLocationWeather({user: user, coordinates: activity.locationStart, dDate: dateStart, aqi: aqi})
                weather.end = await this.getLocationWeather({user: user, coordinates: activity.locationStart, dDate: dateEnd, aqi: aqi})
            } catch (innerEx) {
                logger.error("Weather.getActivityWeather", `User ${user.id} ${user.displayName}`, `Activity ${activity.id}`, innerEx)
            }

            // Weather in the middle of the activity is restricted to PRO users and activities longer than 3 hours.
            if (user.isPro && activity.totalTime > 10800) {
                try {
                    const seconds = activity.totalTime / 2
                    const dateMid = dayjs(activity.dateStart).add(seconds, "seconds").utcOffset(activity.utcStartOffset)
                    weather.mid = await this.getLocationWeather({user: user, coordinates: activity.locationStart, dDate: dateMid, aqi: aqi})
                } catch (innerEx) {
                    logger.error("Weather.getActivityWeather", `User ${user.id} ${user.displayName}`, `Activity ${activity.id}`, "Mid location", innerEx)
                }
            }

            // Make sure weather result is valid.
            if (!weather.start && !weather.end) {
                throw new Error("Failed to get the activity weather")
            }

            const startSummary = weather.start ? `Start ${dateStart.format("LT")}, ${weather.start.provider}: ${weather.start.summary}` : "No weather for start location"
            const endSummary = weather.end ? `End ${dateStart.format("LT")}, ${weather.end.provider}: ${weather.end.summary}` : "No weather for end location"
            logger.info("Weather.getActivityWeather", `User ${user.id} ${user.displayName}`, `Activity ${activity.id}`, startSummary, endSummary)

            return weather
        } catch (ex) {
            logger.error("Weather.getActivityWeather", `User ${user.id} ${user.displayName}`, `Activity ${activity.id}`, ex)
            return null
        }
    }

    /**
     * Gets the weather for a given location and date.
     * @param options The weather request options.
     */
    getLocationWeather = async (options: WeatherRequestOptions): Promise<WeatherSummary> => {
        if (!options.dDate || !options.coordinates || options.coordinates.length != 2 || isNaN(options.coordinates[0]) || isNaN(options.coordinates[1])) {
            const coordinatesLog = options.coordinates?.join(", ") || "no coordinates"
            const dateLog = options.dDate?.format("lll") || "no date"
            logger.warn("Weather.getLocationWeather", coordinatesLog, dateLog, "Missing coordinates or date, won't fetch")
            return null
        }

        // Round coordinates to 11 meters.
        options.coordinates = options.coordinates.map((c) => parseFloat(c.toFixed(4))) as [number, number]

        let result: WeatherSummary
        let providerModule: WeatherProvider
        let isDefaultProvider: boolean = false

        const user = options.user
        const preferences = user.preferences
        const logDate = options.dDate.format("lll")
        const utcDate = options.dDate.utc()
        const utcNow = dayjs.utc()
        const hours = utcNow.diff(utcDate, "hours")
        const latlon = options.coordinates.join(", ")

        // Get provider from parameter, then preferences, finally the default from settings.
        if (!options.provider) {
            const defaultProvider = user.isPro ? _.sample(settings.weather.defaultProviders.pro) : _.sample(settings.weather.defaultProviders.free)
            options.provider = preferences && preferences.weatherProvider ? preferences.weatherProvider : defaultProvider
            isDefaultProvider = true
        }

        // Look on cache first.
        const cacheId = `${options.coordinates.join("-")}-${options.dDate.valueOf() / 1000}${options.aqi ? "-aqi" : ""}`
        const cached: WeatherSummary = cache.get(`weather`, cacheId)
        if (cached && (isDefaultProvider || cached.provider == options.provider)) {
            logger.info("Weather.getLocationWeather.fromCache", latlon, logDate, cached.provider, cached.summary)
            return cached
        }

        // Get providers that accept the given date and are under the daily usage quota.
        const availableProviders = this.providers.filter((p) => {
            if (p.hoursPast < hours) return false
            if (p.hoursFuture < hours * -1) return false
            if (p.disabledTillDate && utcNow.isBefore(p.disabledTillDate)) return false
            return p.stats.requestCount < settings.weather[p.name].rateLimit.perDay || utcNow.diff(p.stats.lastRequest, "hours") > 16
        })

        // No providers available at the moment? Stop here.
        if (availableProviders.length == 0) {
            logger.warn("Weather.getLocationWeather", latlon, logDate, "No weather providers available for that query")
            return null
        }

        // Get a list (max 3) of providers to be used for this request.
        let currentProviders: WeatherProvider[] = _.remove(availableProviders, {name: options.provider})
        if (currentProviders.length > 0) {
            currentProviders = _.concat(currentProviders, _.sampleSize(availableProviders, 2))
        } else {
            currentProviders = _.sampleSize(availableProviders, 2)
        }

        // Helper function to fetch weather data using the existing available providers.
        const fetchWeather = async () => {
            try {
                providerModule = currentProviders.shift()

                result = await providerModule.getWeather(user, options.coordinates, options.dDate)
                if (result) {
                    providerModule.disabledTillDate = null
                    providerModule.stats.repeatedErrors = 0
                } else {
                    throw new Error("No weather summary returned")
                }
            } catch (ex) {
                const failedProviderName = providerModule.name
                providerModule.stats.repeatedErrors++

                // Daily rate limit reached, or too many consecutive errors?
                if (ex.response?.status == 402) {
                    providerModule.disabledTillDate = utcNow.endOf("day").add(1, "hour").toDate()
                    logger.warn("Weather.getLocationWeather", failedProviderName, "Daily quota reached")
                } else if (providerModule.stats.repeatedErrors > settings.weather.maxRepeatedErrors) {
                    providerModule.disabledTillDate = utcNow.add(1, "hour").toDate()
                    providerModule.stats.repeatedErrors = 0
                    logger.warn("Weather.getLocationWeather", failedProviderName, "Temporarily disabled, too many repeated errors")
                }

                // Still has other providers to try and fetch the weather?
                if (currentProviders.length > 0) {
                    providerModule = currentProviders[1]
                    logger.warn("Weather.getLocationWeather", `User ${user.id} ${user.displayName}`, latlon, logDate, `${failedProviderName} failed, will try another`, ex.message)
                } else {
                    logger.error("Weather.getLocationWeather", `User ${user.id} ${user.displayName}`, latlon, logDate, failedProviderName, ex)
                }
            }
        }

        // Keep trying to fetch weather data.
        while (!result && currentProviders.length > 0) {
            await fetchWeather()
        }

        // No valid weather found?
        if (!result) {
            return null
        }

        // Some providers have the AIQ returned by default but some don't, so here we get
        // the list of providers with AIQ supported to get the value separately, if needed.
        if (!result.aqi && options.aqi) {
            const aqiProviders = this.providers.filter((p) => p.getAirQuality)

            while (!result.aqi && aqiProviders.length > 0) {
                try {
                    providerModule = _.sample(aqiProviders)
                    result.aqi = await providerModule.getAirQuality(options.user, options.coordinates, options.dDate)
                } catch (aqiEx) {
                    if (aqiProviders.length > 0) {
                        logger.warn("Weather.getLocationWeather", `User ${user.id} ${user.displayName}`, latlon, logDate, `Air quality: ${providerModule.name} failed, will try another`, aqiEx.message)
                    } else {
                        logger.error("Weather.getLocationWeather", `User ${user.id} ${user.displayName}`, latlon, logDate, `Air quality: ${providerModule.name}`, aqiEx)
                    }
                }
            }
        }

        processWeatherSummary(result, options.dDate, preferences)

        // Save to cache and return weather results.
        cache.set(`weather`, cacheId, result)
        logger.info("OpenWeatherMap.getWeather", `User ${user.id} ${user.displayName}`, weatherSummaryString(options.coordinates, options.dDate, result))

        return result
    }
}

// Exports...
export default Weather.Instance
