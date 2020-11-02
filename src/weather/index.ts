// Strautomator Core: Weather

import {ActivityWeather, WeatherProvider, WeatherSummary} from "./types"
import {StravaActivity} from "../strava/types"
import {UserPreferences} from "../users/types"
import climacell from "./climacell"
import darksky from "./darksky"
import openweathermap from "./openweathermap"
import weatherapi from "./weatherapi"
import weatherbit from "./weatherbit"
import _ = require("lodash")
import cache = require("bitecache")
import logger = require("anyhow")
import moment = require("moment")
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
            iconText: "",
            temperature: "",
            humidity: "",
            pressure: "",
            windSpeed: "",
            windBearing: "" as any,
            precipType: "",
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
            if (!settings.weather.darksky.disabled) {
                await darksky.init()
                this.providers.push(darksky)
            }
            if (!settings.weather.climacell.disabled) {
                await climacell.init()
                this.providers.push(climacell)
            }
            if (!settings.weather.weatherbit.disabled) {
                await weatherbit.init()
                this.providers.push(weatherbit)
            }
            if (!settings.weather.openweathermap.disabled) {
                await openweathermap.init()
                this.providers.push(openweathermap)
            }
            if (!settings.weather.weatherapi.disabled) {
                await weatherapi.init()
                this.providers.push(weatherapi)
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
     * @param provider The prefered weather provider, use DarkSky by default.
     */
    getActivityWeather = async (activity: StravaActivity, preferences: UserPreferences): Promise<ActivityWeather> => {
        try {
            if (!activity.locationEnd && !activity.locationEnd) {
                throw new Error(`No location data for activity ${activity.id}`)
            }

            // We can only go back as far as 3 months.
            if (activity.dateEnd && moment.utc(activity.dateEnd).unix() < moment().subtract(settings.weather.maxAgeDays, "days").unix()) {
                logger.warn("Weather.getActivityWeather", `Activity ${activity.id}`, `Older than ${settings.weather.maxAgeDays} days, will not fetch weather`)
                return null
            }

            if (!preferences) preferences = {}
            let weather: ActivityWeather

            // Default provider is darksky.
            let provider: string = preferences.weatherProvider ? preferences.weatherProvider : "darksky"

            // Look on cache first.
            const cached: ActivityWeather = cache.get(`weather`, activity.id.toString())
            if (cached && cached.provider == provider) {
                logger.info("Weather.getActivityWeather", `Activity ${activity.id}`, "From cache")
                return cached
            }

            // Get correct provider module.
            let providerModule: WeatherProvider = _.find(this.providers, {name: provider})

            // Try fetching weather data from the preferred provider.
            try {
                weather = await providerModule.getActivityWeather(activity, preferences)

                if (!weather.start && !weather.end) {
                    throw new Error("No weather returned for start and end")
                }
            } catch (ex) {
                logger.warn("Weather.getActivityWeather", `Activity ${activity.id}`, `Provider ${provider} failed, will try another`)

                // Try again with a different provider if first failed.
                try {
                    providerModule = _.sample(_.reject(this.providers, {name: provider}))
                    provider = providerModule.name
                    weather = await providerModule.getActivityWeather(activity, preferences)
                } catch (ex) {
                    logger.debug("Weather.getActivityWeather", `Activity ${activity.id}`, `Provider ${provider} also failed, won't try again`)
                    throw ex
                }
            }

            // Make sure weather result is valid.
            if (!weather) {
                throw new Error(`Could not get weather data for activity ${activity.id}`)
            }

            const startSummary = weather.start ? `Start: ${weather.start.summary}` : "No weather for start location"
            const endSummary = weather.end ? `End: ${weather.end.summary}` : "No weather for end location"
            logger.info("Weather.getActivityWeather", `Activity ${activity.id}`, `Provider: ${provider}`, startSummary, endSummary)

            cache.set(`weather`, activity.id.toString(), weather)
            return weather
        } catch (ex) {
            logger.error("Weather.getActivityWeather", `Activity ${activity.id}`, ex)
            return null
        }
    }
}

// Exports...
export default Weather.Instance
