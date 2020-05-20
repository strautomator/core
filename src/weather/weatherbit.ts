// Strautomator Core: Weather - Weatherbit

import {ActivityWeather, WeatherProvider, WeatherSummary} from "./types"
import {StravaActivity} from "../strava/types"
import {UserPreferences} from "../users/types"
import logger = require("anyhow")
import moment = require("moment")
const axios = require("axios").default
const settings = require("setmeup").settings

/**
 * Weatherbit weather API. Only supports ccurrent weather (no historical data).
 */
export class Weatherbit implements WeatherProvider {
    private constructor() {}
    private static _instance: Weatherbit
    static get Instance(): Weatherbit {
        return this._instance || (this._instance = new this())
    }

    /** Weather provider name for Weatherbit. */
    name: string = "weatherbit"
    /** Weatherbit provider. */
    title: string = "Weatherbit"

    // INIT
    // --------------------------------------------------------------------------

    /**
     * Init the Weatherbit wrapper.
     */
    init = async (): Promise<void> => {
        try {
            if (!settings.weather.weatherbit.secret) {
                throw new Error("Missing the mandatory weather.weatherbit.secret setting")
            }
        } catch (ex) {
            logger.error("Weatherbit.init", ex)
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
            const units = preferences.weatherUnit == "f" ? "I" : "M"
            const baseUrl = `${settings.weather.weatherbit.baseUrl}?key=${settings.weather.weatherbit.secret}`
            const baseQuery = `&lat=${coordinates[0]}&lon=${coordinates[1]}&tz=local&lang=${lang}&units=${units}`
            const weatherUrl = baseUrl + baseQuery

            const res = await axios({url: weatherUrl})
            const result = this.toWeatherSummary(res.data.data[0], preferences)

            logger.info("Weatherbit.getCurrentWeather", coordinates, `Temp ${result.temperature}, humidity ${result.humidity}, precipitation ${result.precipType}`)
            return result
        } catch (ex) {
            logger.error("Weatherbit.getCurrentWeather", coordinates, ex)
        }
    }

    /**
     * Return the weather for the specified activity.
     * @param activity The Strava activity.
     * @param preferences User preferences to correctly set weathre units.
     */
    getActivityWeather = async (activity: StravaActivity, preferences: UserPreferences): Promise<ActivityWeather> => {
        try {
            if (!activity.locationEnd) {
                throw new Error(`Activity ${activity.id} has no location data`)
            }
            if (moment(activity.dateEnd).unix() < moment().subtract(1, "h").unix()) {
                throw new Error(`Activity ${activity.id} ended more than 1 hour ago, Weatherbit only supports realtime weather`)
            }

            const weather: ActivityWeather = {provider: this.name}

            // Get current weather report.
            const lang = preferences.language || "en"
            const units = preferences.weatherUnit == "f" ? "I" : "M"
            const baseUrl = `${settings.weather.weatherbit.baseUrl}?key=${settings.weather.weatherbit.secret}`
            const baseQuery = `&lat=${activity.locationEnd[0]}&lon=${activity.locationEnd[1]}&tz=local&lang=${lang}&units=${units}`
            const result: any = await axios({url: baseUrl + baseQuery})
            weather.end = this.toWeatherSummary(result.data.data[0], preferences)

            return weather
        } catch (ex) {
            logger.error("Weatherbit.getActivityWeather", `Activity ${activity.id}`, ex)
            throw ex
        }
    }

    /**
     * Transform data from the Weatherbit API to a WeatherSummary.
     * @param data Data from Weatherbit.
     * @param preferences User preferences.
     */
    private toWeatherSummary = (data: any, preferences: UserPreferences): WeatherSummary => {
        logger.debug("Weatherbit.toWeatherSummary", data)

        const code = data.weather.code.substring(1)
        let iconText, precipType, wind

        // Get correct icon text based on the wather code.
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
            wind = data.wind_spd.toFixed(0) + " mph"
        } else {
            wind = data.wind_spd.toFixed(1) + " m/s"
        }

        const tempUnit = preferences.weatherUnit ? preferences.weatherUnit.toUpperCase() : "C"

        return {
            summary: data.weather.description,
            iconText: iconText,
            temperature: data.temp.toFixed(0) + "°" + tempUnit,
            humidity: data.rh.toFixed(0) + "%",
            pressure: data.pres.toFixed(0) + " hPa",
            windSpeed: wind,
            windBearing: data.wind_dir,
            precipType: precipType
        }
    }
}

// Exports...
export default Weatherbit.Instance
