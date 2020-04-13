// Strautomator Core: Weather

import {ActivityWeather, MoonPhase, WeatherProvider} from "./types"
import {StravaActivity} from "../strava/types"
import darksky from "./darksky"
import openweathermap from "./openweathermap"
import weatherbit from "./weatherbit"
import _ = require("lodash")
import cache = require("bitecache")
import logger = require("anyhow")
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
    providers: WeatherProvider[] = [darksky, openweathermap, weatherbit]

    // INIT
    // --------------------------------------------------------------------------

    /**
     * Init the Weather wrapper.
     */
    init = async (): Promise<void> => {
        try {
            await darksky.init()

            cache.setup("weather", settings.weather.cacheDuration)
            logger.info("Weather.init")
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
    getActivityWeather = async (activity: StravaActivity, provider?: string): Promise<ActivityWeather> => {
        try {
            let weather: ActivityWeather

            // Default provider is darksky.
            if (!provider) {
                provider = "darksky"
            }

            // Look on cache first.
            const cached: ActivityWeather = cache.get(`weather`, activity.id.toString())
            if (cached && cached.provider == provider) {
                logger.info("Weather.getActivityWeather", `Activity ${activity.id}`, "From cache")
                return cached
            }

            // Get correct provider module.
            let providerModule: WeatherProvider = _.find(this.providers, {name: provider})

            // Try fetching weather data from the providers.
            try {
                weather = await providerModule.getActivityWeather(activity)
            } catch (ex) {
                logger.warn("Weather.getActivityWeather", `Activity ${activity.id}`, `Provider ${provider} failed, will try another`)

                // Try again with a random provider, if the prefered failed.
                try {
                    providerModule = _.sample(_.filter(this.providers, (p) => p.name != provider))
                    weather = await providerModule.getActivityWeather(activity)
                } catch (ex) {
                    logger.debug("Weather.getActivityWeather", `Activity ${activity.id}`, `Provider ${provider} also failed, won't try again`)
                    throw ex
                }
            }

            // Set proper weather unicode icon.
            this.processWeather(weather)

            const startSummary = weather.start ? `Start: ${weather.start.summary}` : "No weather for start location"
            const endSummary = weather.end ? `End: ${weather.end.summary}` : "No weather for end location"
            logger.info("Weather.getActivityWeather", `Activity ${activity.id}`, `Provider: ${provider}`, startSummary, endSummary)

            cache.set(`weather`, activity.id.toString(), weather)
            return weather
        } catch (ex) {
            logger.error("Weather.getActivityWeather", `Activity ${activity.id}`, ex)
        }
    }

    // HELPERS
    // --------------------------------------------------------------------------

    /**
     * Process weather result to get correct icon, remove invalid fields etc..
     * @param weather The activity weather details.
     */
    processWeather = (weather: ActivityWeather): void => {
        for (let data of [weather.start, weather.end]) {
            if (data) {
                let unicode: string

                // Property select correct weather icon.
                switch (data.iconText) {
                    case "clear-day":
                        unicode = "2600"
                        break
                    case "rain":
                        unicode = "1F327"
                        break
                    case "hail":
                        unicode = "1F327"
                        break
                    case "snow":
                        unicode = "2744"
                        break
                    case "sleet":
                        unicode = "1F328"
                        break
                    case "wind":
                        unicode = "1F32C"
                        break
                    case "fog":
                        unicode = "1F32B"
                        break
                    case "cloudy":
                        unicode = "2601"
                        break
                    case "partly-cloudy-day":
                        unicode = "26C5"
                        break
                    case "thunderstorm":
                        unicode = "26C8"
                        break
                    case "tornado":
                        unicode = "1F32A"
                        break
                    case "partly-cloudy-night":
                        unicode = "1F319"
                        break
                    case "clear-night":
                        unicode = data.moon == MoonPhase.Full ? "1F316" : "1F312"
                        break
                }

                // Convert code to unicode emoji.
                if (unicode) {
                    data.icon = String.fromCodePoint(parseInt(unicode, 16))
                }

                // No precipitation?
                if (!data.precipType) {
                    data.precipType = null
                }
            }
        }
    }
}

// Exports...
export default Weather.Instance
