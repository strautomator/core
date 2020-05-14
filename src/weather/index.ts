// Strautomator Core: Weather

import {ActivityWeather, MoonPhase, WeatherProvider, WeatherSummary} from "./types"
import {StravaActivity} from "../strava/types"
import climacell from "./climacell"
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
    providers: WeatherProvider[] = []

    /**
     * Helper property to return an empty summary.
     */
    get emptySummary() {
        const emptySummary: WeatherSummary = {
            provider: "",
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
            if (!settings.weather.climacell.disabled) {
                await climacell.init()
                this.providers.push(climacell)
            }
            if (!settings.weather.darksky.disabled) {
                await darksky.init()
                this.providers.push(darksky)
            }
            if (!settings.weather.weatherbit.disabled) {
                await weatherbit.init()
                this.providers.push(weatherbit)
            }
            if (!settings.weather.openweathermap.disabled) {
                await openweathermap.init()
                this.providers.push(openweathermap)
            }

            cache.setup("weather", settings.weather.cacheDuration)
            logger.info("Weather.init", `Loaded ${this.providers.length} providers`)
            const moment = require("moment")
            const dateStart = moment().subtract(6, "h").toDate()
            const dateEnd = new Date()
            const a = {id: 123, locationStart: [51, 13], locationEnd: [50, 12], dateStart: dateStart, dateEnd: dateEnd}
            const test = await this.getActivityWeather(a as StravaActivity, "weatherapi")
            console.dir(test)
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
            if (!activity.locationEnd && !activity.locationEnd) {
                throw new Error(`No location data for activity ${activity.id}`)
            }

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

                // Try again with a different provider.
                try {
                    providerModule = _.reject(this.providers, {name: provider})[0]
                    provider = providerModule.name
                    weather = await providerModule.getActivityWeather(activity)
                } catch (ex) {
                    logger.debug("Weather.getActivityWeather", `Activity ${activity.id}`, `Provider ${provider} also failed, won't try again`)
                    throw ex
                }
            }

            // Make sure weather result is valid.
            if (!weather) {
                throw new Error(`Could not get weather data for activity ${activity.id}`)
            }

            // Get moon phases.
            if (weather.start) {
                weather.start.moon = this.getMoonPhase(activity.dateStart)
            }
            if (weather.end) {
                weather.end.moon = this.getMoonPhase(activity.dateEnd)
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
            return null
        }
    }

    // HELPERS
    // --------------------------------------------------------------------------

    /**
     * Get the moon phase for the specified date.
     * @param date Date to get the moon phase for.
     */
    getMoonPhase = (date: Date): MoonPhase => {
        let year = date.getFullYear()
        let month = date.getMonth() + 1
        let day = date.getDate()
        let zone = date.getTimezoneOffset() / 1440
        let phase

        if (month < 3) {
            year--
            month += 12
        }

        let c = 365.25 * year
        let e = 30.6 * month

        // Get total elapsed days and divide by moon cycle.
        let jd = c + e + day + zone - 694039.09
        jd /= 29.5305882

        // Get only the integer part of the result and leave fractional part out.
        phase = parseInt(jd.toString())
        jd -= phase

        // Here's the actual moon phase. From 0 (new moon) to 4 (full moon) to 7 (waning crescent).
        phase = Math.round(jd * 8)
        if (phase >= 8) phase = 0

        // Return  moon phase.
        if (phase == 0) return MoonPhase.New
        if (phase == 4) return MoonPhase.Full
        return MoonPhase.Quarter
    }

    /**
     * Process weather result to get correct icon, remove invalid fields etc..
     * @param weather The activity weather details.
     */
    processWeather = (weather: ActivityWeather): void => {
        for (let data of [weather.start, weather.end]) {
            if (data) {
                let unicode: string

                // Replace spaces with dashes.
                if (data.iconText) {
                    data.iconText = data.iconText.replace(/ /g, "-")
                }

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
                    case "freezing-rain":
                    case "ice-pellets":
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

                // No summary yet? Set one now.
                if (!data.summary) {
                    const arr = data.iconText.split("-")

                    let summary = arr[0]
                    if (arr.length > 1) {
                        summary += " " + arr[1]
                    }

                    data.summary = summary
                }
            }
        }
    }
}

// Exports...
export default Weather.Instance
