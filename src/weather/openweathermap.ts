// Strautomator Core: Weather - OpenWeatherMap

import {ActivityWeather, WeatherProvider, WeatherSummary} from "./types"
import {processWeatherSummary} from "./utils"
import {StravaActivity} from "../strava/types"
import {UserPreferences} from "../users/types"
import logger = require("anyhow")
import moment = require("moment")
const axios = require("axios").default
const settings = require("setmeup").settings

/**
 * OpenWeatherMap weather API. Only supports ccurrent weather (no historical data).
 */
export class OpenWeatherMap implements WeatherProvider {
    private constructor() {}
    private static _instance: OpenWeatherMap
    static get Instance(): OpenWeatherMap {
        return this._instance || (this._instance = new this())
    }

    /** Weather provider name for OpenWeatherMap. */
    name: string = "openweathermap"
    /** OpenWeatherMap provider. */
    title: string = "OpenWeatherMap"

    // INIT
    // --------------------------------------------------------------------------

    /**
     * Init the OpenWeatherMap wrapper.
     */
    init = async (): Promise<void> => {
        try {
            if (!settings.weather.openweathermap.secret) {
                throw new Error("Missing the mandatory weather.openweathermap.secret setting")
            }
        } catch (ex) {
            logger.error("OpenWeatherMap.init", ex)
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

            const lang = preferences.language || "en"
            const units = preferences.weatherUnit == "f" ? "imperial" : "metric"
            const baseUrl = `${settings.weather.openweathermap.baseUrl}?appid=${settings.weather.openweathermap.secret}`
            const query = `&units=${units}&lang=${lang}&lat=${coordinates[0]}&lon=${coordinates[1]}`
            const weatherUrl = baseUrl + query

            const res = await axios({url: weatherUrl})
            const result = this.toWeatherSummary(res.data, new Date(), preferences)

            logger.info("OpenWeatherMap.getCurrentWeather", coordinates, `Temp ${result.temperature}, humidity ${result.humidity}, precipitation ${result.precipType}`)
            return result
        } catch (ex) {
            logger.error("OpenWeatherMap.getCurrentWeather", coordinates, ex)
        }
    }

    /**
     * Return the weather for the specified activity. Only works for the current weather.
     * @param activity The Strava activity.
     * @param preferences User preferences to correctly set weathre units.
     */
    getActivityWeather = async (activity: StravaActivity, preferences: UserPreferences): Promise<ActivityWeather> => {
        try {
            if (!activity.locationEnd) {
                throw new Error(`Activity ${activity.id} has no location data`)
            }
            if (moment(activity.dateEnd).unix() < moment().subtract(1, "h").unix()) {
                throw new Error(`Activity ${activity.id} ended more than 1 hour ago, OpenWeatherMap only supports realtime weather`)
            }

            const weather: ActivityWeather = {provider: this.name}

            // Get current weather report.
            const lang = preferences.language || "en"
            const units = preferences.weatherUnit == "f" ? "imperial" : "metric"
            const baseUrl = `${settings.weather.openweathermap.baseUrl}?appid=${settings.weather.openweathermap.secret}`
            const query = `&units=${units}&lang=${lang}&lat=${activity.locationEnd[0]}&lon=${activity.locationEnd[1]}`
            const result: any = await axios({url: baseUrl + query})
            weather.end = this.toWeatherSummary(result.data, new Date(), preferences)

            return weather
        } catch (ex) {
            logger.error("OpenWeatherMap.getActivityWeather", `Activity ${activity.id}`, ex)
            throw ex
        }
    }

    /**
     * Transform data from the OpenWeatherMap API to a WeatherSummary.
     * @param data Data from OpenWeatherMap.
     * @param preferences User preferences.
     */
    private toWeatherSummary = (data: any, date: Date, preferences: UserPreferences): WeatherSummary => {
        logger.debug("OpenWeatherMap.toWeatherSummary", data)

        const code = data.weather[0].icon.substring(1)
        let iconText, precipType, wind

        switch (code) {
            case "2":
                iconText = "thunderstorm"
                break
            case "3":
            case "5":
                iconText = "rain"
                break
            case "6":
                iconText = ["610", "611"].indexOf(data.weather.code) < 0 ? "snow" : "sleet"
                break
            case "7":
                iconText = "fog"
                break
            case "8":
                iconText = ["800", "801"].indexOf(data.weather.code) < 0 ? "cloudy" : "clear-day"
                break
            case "9":
                iconText = "rain"
                break
            default:
                iconText = "cloudy"
        }

        // Get correct precipitation type.
        if (data.snow) {
            precipType = "snow"
        } else if (data.rain) {
            precipType = "rain"
        }

        // Get correct wind speed.
        if (preferences.weatherUnit == "f") {
            wind = data.wind.speed.toFixed(0) + " mph"
        } else {
            wind = data.wind.speed.toFixed(1) + " m/s"
        }

        const tempUnit = preferences.weatherUnit ? preferences.weatherUnit.toUpperCase() : "C"

        // Capitalize the summary.
        let summary = data.weather[0].description
        summary = summary.charAt(0).toUpperCase() + summary.slice(1)

        const result: WeatherSummary = {
            summary: summary,
            iconText: iconText,
            temperature: data.main.temp.toFixed(0) + "°" + tempUnit,
            humidity: data.main.humidity.toFixed(0) + "%",
            pressure: data.main.pressure.toFixed(0) + " hPa",
            windSpeed: wind,
            windBearing: data.wind.deg,
            precipType: precipType || null
        }

        // Process and return weather summary.
        processWeatherSummary(result, date)
        return result
    }
}

// Exports...
export default OpenWeatherMap.Instance
