// Strautomator Core: Weather - ClimaCell

import {ActivityWeather, WeatherProvider, WeatherSummary} from "./types"
import {StravaActivity} from "../strava/types"
import {UserPreferences} from "../users/types"
import _ = require("lodash")
import logger = require("anyhow")
import moment = require("moment")
const axios = require("axios").default
const settings = require("setmeup").settings

/**
 * ClimaCell weather API.
 */
export class ClimaCell implements WeatherProvider {
    private constructor() {}
    private static _instance: ClimaCell
    static get Instance(): ClimaCell {
        return this._instance || (this._instance = new this())
    }

    /** Weather provider name for ClimaCell. */
    name: string = "climacell"
    /** ClimaCell provider. */
    title: string = "ClimaCell"

    // INIT
    // --------------------------------------------------------------------------

    /**
     * Init the ClimaCell wrapper.
     */
    init = async (): Promise<void> => {
        try {
            if (!settings.weather.climacell.secret) {
                throw new Error("Missing the mandatory weather.climacell.secret setting")
            }
        } catch (ex) {
            logger.error("ClimaCell.init", ex)
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
            const fields = "temp,humidity,wind_speed,wind_direction,baro_pressure,precipitation,precipitation_type,cloud_cover"
            const baseQuery = `unit_system=${units}&apikey=${settings.weather.climacell.secret}&`
            const weatherUrl = `${settings.weather.climacell.baseUrl}${`realtime?fields=${fields},weather_code&`}${baseQuery}lat=${coordinates[0]}&lon=${coordinates[1]}`

            const res = await axios({url: weatherUrl})
            const result = this.toWeatherSummary(res.data, new Date())

            logger.info("ClimaCell.getCurrentWeather", coordinates, `Temp ${result.temperature}, humidity ${result.humidity}, precipitation ${result.precipType}`)
            return result
        } catch (ex) {
            logger.error("ClimaCell.getCurrentWeather", coordinates, ex)
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

            // Base query parameters.
            const units = preferences.weatherUnit == "f" ? "us" : "si"
            const fields = "temp,humidity,wind_speed,wind_direction,baro_pressure,precipitation,precipitation_type,cloud_cover"
            const baseQuery = `unit_system=${units}&apikey=${settings.weather.climacell.secret}&`

            // Helpers to build the API URL. If date is older than 1 hour, use historical data, otherwise realtime.
            const getUrl = (location: number[], date: Date) => {
                const mDate = moment(date)
                let startTime = mDate.toISOString()
                let endpoint

                // Get correct endpoint depending on how far back the specified date is.
                if (mDate.unix() <= moment().subtract(5, "h").unix()) {
                    endpoint = `historical/station?&fields=${fields}&start_time=${startTime}&end_time=${mDate.add(2, "h").toISOString()}&`
                } else if (mDate.unix() <= moment().subtract(1, "h").unix()) {
                    endpoint = `historical/climacell?fields=${fields},weather_code&timestep=60&start_time=${startTime}&end_time=now&`
                } else {
                    endpoint = `realtime?fields=${fields},weather_code&`
                }

                return `${settings.weather.climacell.baseUrl}${endpoint}${baseQuery}lat=${location[0]}&lon=${location[1]}`
            }

            // Get weather report for start location.
            if (activity.dateStart && activity.locationStart) {
                try {
                    const startResult: any = await axios({url: getUrl(activity.locationStart, activity.dateStart)})
                    weather.start = this.toWeatherSummary(startResult.data, activity.dateStart)
                } catch (ex) {
                    logger.error("ClimaCell.getActivityWeather", `Activity ${activity.id}, weather at start`, ex)
                }
            }

            // Get weather report for end location.
            if (activity.dateEnd && activity.locationEnd) {
                try {
                    const endResult: any = await axios({url: getUrl(activity.locationEnd, activity.dateEnd)})
                    weather.end = this.toWeatherSummary(endResult.data, activity.dateEnd)
                } catch (ex) {
                    logger.error("ClimaCell.getActivityWeather", `Activity ${activity.id}, weather at end`, ex)
                }
            }

            return weather
        } catch (ex) {
            logger.error("ClimaCell.getActivityWeather", `Activity ${activity.id}`, ex)
            throw ex
        }
    }

    /**
     * Transform data from the ClimaCell API to a WeatherSummary.
     * @param data Data from ClimaCell.
     */
    private toWeatherSummary = (data: any, date: Date): WeatherSummary => {
        logger.debug("ClimaCell.toWeatherSummary", data)

        // If data is collection of results, use the first one only.
        if (_.isArray(data)) data = data[0]

        const hour = date.getHours()
        const isDaylight = hour > 6 && hour < 19
        const cloudCover = data.cloud_cover.value

        let precipType = data.precipitation_type ? data.precipitation_type.value : null
        let iconText: string

        // No precipitation? Set it to null.
        if (precipType == "none") {
            precipType = null
        }

        if (data.weather_code && data.weather_code.value) {
            iconText = data.weather_code.value
        } else if (cloudCover < 10) {
            iconText = isDaylight ? "clear-day" : "clear-night"
        } else if (cloudCover < 50) {
            iconText = isDaylight ? "partly-cloudy-day" : "partly-cloudy-night"
        } else if (precipType) {
            iconText = precipType
        } else {
            iconText = "cloudy"
        }

        // Replace underscore with dashes on weather code.
        if (data.iconText) {
            data.iconText = data.iconText.replace(/_/g, "-")
        }

        return {
            iconText: iconText,
            temperature: data.temp.value.toFixed(0) + "°" + data.temp.units,
            humidity: data.humidity.value ? data.humidity.value.toFixed(0) + data.humidity.units : null,
            pressure: data.baro_pressure.value.toFixed(0) + " " + data.baro_pressure.units,
            windSpeed: data.wind_speed.value.toFixed(1) + " " + data.wind_speed.units,
            windBearing: data.wind_direction.value,
            precipType: precipType
        }
    }
}

// Exports...
export default ClimaCell.Instance
