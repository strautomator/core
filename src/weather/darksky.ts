// Strautomator Core: Weather - Dark Sky

import {ActivityWeather, WeatherProvider, WeatherSummary} from "./types"
import {processWeatherSummary} from "./utils"
import {StravaActivity} from "../strava/types"
import {UserPreferences} from "../users/types"
import {axiosRequest} from "../axios"
import logger = require("anyhow")
import moment = require("moment")
const settings = require("setmeup").settings

/**
 * DarkSky weather API.
 */
export class DarkSky implements WeatherProvider {
    private constructor() {}
    private static _instance: DarkSky
    static get Instance(): DarkSky {
        return this._instance || (this._instance = new this())
    }

    /** Weather provider name for Dark Sky. */
    name: string = "darksky"
    /** Dark Sky provider. */
    title: string = "Dark Sky"

    // INIT
    // --------------------------------------------------------------------------

    /**
     * Init the Dark Sky wrapper.
     */
    init = async (): Promise<void> => {
        try {
            if (!settings.weather.darksky.secret) {
                throw new Error("Missing the mandatory weather.darksky.secret setting")
            }
        } catch (ex) {
            logger.error("DarkSky.init", ex)
        }
    }

    // METHODS
    // --------------------------------------------------------------------------

    /**
     * Get current weather conditions for the specified coordinates.
     * @param coordinates Array with latitude and longitude.
     * @param preferences User preferences to get proper weather units.
     */
    getCurrentWeather = async (coordinates: [number, number], preferences: UserPreferences): Promise<WeatherSummary> => {
        try {
            if (!preferences) preferences = {}

            const units = preferences.weatherUnit == "f" ? "us" : "si"
            const lang = preferences.language || "en"
            const now = moment().subtract(10, "m")
            const endpoint = `${coordinates[0]},${coordinates[1]},${now.unix()}?units=${units}&lang=${lang}`
            const weatherUrl = `${settings.weather.darksky.baseUrl}${settings.weather.darksky.secret}/${endpoint}`

            const res = await axiosRequest({url: weatherUrl})
            const result = this.toWeatherSummary(res, now.utc().toDate(), preferences)

            if (result) {
                logger.info("DarkSky.getCurrentWeather", coordinates, `Temp ${result.temperature}, humidity ${result.humidity}, precipitation ${result.precipType}`)
            }

            return result
        } catch (ex) {
            logger.error("DarkSky.getCurrentWeather", coordinates, ex)
        }
    }

    /**
     * Return the weather for the specified activity.
     * @param activity The Strava activity.
     * @param preferences User preferences to correctly set weathre units.
     */
    getActivityWeather = async (activity: StravaActivity, preferences: UserPreferences): Promise<ActivityWeather> => {
        try {
            if (!activity.locationStart && !activity.locationEnd) {
                throw new Error(`Activity ${activity.id} has no location data`)
            }

            const weather: ActivityWeather = {provider: this.name}

            // Get defaults based on user preference.
            const units = preferences.weatherUnit == "f" ? "us" : "si"
            const lang = preferences.language || "en"

            // Helper to get the API URL.
            const getUrl = (location: number[], date: Date) => {
                const timestamp = moment.utc(date).unix()
                const endpoint = `${location[0]},${location[1]},${timestamp}?units=${units}&lang=${lang}`
                return `${settings.weather.darksky.baseUrl}${settings.weather.darksky.secret}/${endpoint}`
            }

            // Get weather report for start location.
            if (activity.dateStart && activity.locationStart) {
                try {
                    const startResult: any = await axiosRequest({url: getUrl(activity.locationStart, activity.dateStart)})

                    if (startResult && startResult.currently) {
                        weather.start = this.toWeatherSummary(startResult, activity.dateStart, preferences)
                    } else {
                        logger.warn("DarkSky.getActivityWeather", `Activity ${activity.id}`, `No weather data for start location ${activity.locationStart.join(", ")}`)
                    }
                } catch (ex) {
                    logger.error("DarkSky.getActivityWeather", `Activity ${activity.id}, weather at start`, ex)
                }
            }

            // Get weather report for end location.
            if (activity.dateEnd && activity.locationEnd) {
                try {
                    const endResult: any = await axiosRequest({url: getUrl(activity.locationEnd, activity.dateEnd)})

                    if (endResult && endResult.currently) {
                        weather.end = this.toWeatherSummary(endResult, activity.dateEnd, preferences)
                    } else {
                        logger.warn("DarkSky.getActivityWeather", `Activity ${activity.id}`, `No weather data for end location ${activity.locationEnd.join(", ")}`)
                    }
                } catch (ex) {
                    logger.error("DarkSky.getActivityWeather", `Activity ${activity.id}, weather at end`, ex)
                }
            }

            return weather
        } catch (ex) {
            logger.error("DarkSky.getActivityWeather", `Activity ${activity.id}`, ex)
            throw ex
        }
    }

    /**
     * Transform data from the Dark Sky API to a WeatherSummary.
     * @param data Data from Dark Sky.
     */
    private toWeatherSummary = (data: any, date: Date, preferences: UserPreferences): WeatherSummary => {
        logger.debug("DarkSky.toWeatherSummary", data)

        const tempUnit = preferences.weatherUnit ? preferences.weatherUnit.toUpperCase() : "C"
        const windUnit = preferences.weatherUnit == "f" ? " mph" : " m/s"
        const temperature = data.currently.temperature ? data.currently.temperature.toFixed(0) + "°" + tempUnit : null
        const humidity = data.currently ? (data.currently.humidity * 100).toFixed(0) + "%" : null
        const pressure = data.currently.pressure ? data.currently.pressure.toFixed(0) + " hPa" : null
        const windSpeed = data.currently.windSpeed ? data.currently.windSpeed.toFixed(1) + windUnit : null

        const result: WeatherSummary = {
            summary: data.currently.summary,
            iconText: data.currently.icon,
            temperature: temperature,
            humidity: humidity,
            pressure: pressure,
            windSpeed: windSpeed,
            windBearing: data.currently.windBearing,
            precipType: data.currently.precipType || null
        }

        // Process and return weather summary.
        processWeatherSummary(result, date)
        return result
    }
}

// Exports...
export default DarkSky.Instance
