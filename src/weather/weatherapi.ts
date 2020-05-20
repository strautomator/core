// Strautomator Core: WeatherAPI.com (NOT WORKING YET)

import {ActivityWeather, WeatherProvider, WeatherSummary} from "./types"
import {processWeatherSummary} from "./utils"
import {StravaActivity} from "../strava/types"
import {UserPreferences} from "../users/types"
import _ = require("lodash")
import logger = require("anyhow")
import moment = require("moment")
const axios = require("axios").default
const settings = require("setmeup").settings

/**
 * WeatherAPI.com weather API.
 */
export class WeatherAPI implements WeatherProvider {
    private constructor() {}
    private static _instance: WeatherAPI
    static get Instance(): WeatherAPI {
        return this._instance || (this._instance = new this())
    }

    /** Weather provider name for WeatherAPI. */
    name: string = "weatherapi"
    /** WeatherAPI provider. */
    title: string = "WeatherAPI.com"

    // INIT
    // --------------------------------------------------------------------------

    /**
     * Init the WeatherAPI.com wrapper.
     */
    init = async (): Promise<void> => {
        try {
            if (!settings.weather.weatherapi.secret) {
                throw new Error("Missing the mandatory weather.weatherapi.secret setting")
            }
        } catch (ex) {
            logger.error("WeatherAPI.init", ex)
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
            const baseUrl = settings.weather.weatherapi.baseUrl
            const baseQuery = `key=${settings.weather.weatherapi.secret}&lang=${lang}&q=`
            const currentQuery = `${baseQuery}${coordinates[0]},${coordinates[1]}`
            const weatherUrl = `${baseUrl}current.json?${currentQuery}`
            const now = new Date()

            const res = await axios({url: weatherUrl})
            const data = this.filterData(res.data, now)
            const result = this.toWeatherSummary(data, now, preferences)

            logger.info("WeatherAPI.getCurrentWeather", coordinates, `Temp ${result.temperature}, humidity ${result.humidity}, precipitation ${result.precipType}`)
            return result
        } catch (ex) {
            logger.error("WeatherAPI.getCurrentWeather", coordinates, ex)
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
            const lang = preferences.language || "en"
            const baseUrl = settings.weather.weatherapi.baseUrl
            const baseQuery = `key=${settings.weather.weatherapi.secret}&lang=${lang}&q=`

            // Helper to get correct weather API URL.
            const getUrl = (location: number[], date: Date) => {
                const now = moment().unix()
                const startTime = moment(date).unix()

                // If more than 1 hour ago use historical data, otherwise use current.
                if (startTime < now - 3600) {
                    const endTime = now < startTime + 7200 ? now : startTime + 7200
                    const historyQuery = `${baseQuery}${location[0]},${location[1]}&unixdt=${startTime}&unixend_dt=${endTime}`
                    return `${baseUrl}history.json?${historyQuery}`
                } else {
                    const currentQuery = `${baseQuery}${location[0]},${location[1]}`
                    return `${baseUrl}current.json?${currentQuery}`
                }
            }

            // Get weather report for start location.
            if (activity.dateStart && activity.locationStart) {
                try {
                    const startResult: any = await axios({url: getUrl(activity.locationStart, activity.dateStart)})
                    const startData = this.filterData(startResult.data, activity.dateStart)
                    weather.start = this.toWeatherSummary(startData, activity.dateStart, preferences)
                } catch (ex) {
                    logger.error("WeatherAPI.getActivityWeather", `Activity ${activity.id}, weather at start`, ex)
                }
            }

            // Get weather report for end location.
            if (activity.dateEnd && activity.locationEnd) {
                try {
                    const endResult: any = await axios({url: getUrl(activity.locationStart, activity.dateEnd)})
                    const endData = this.filterData(endResult.data, activity.dateStart)
                    weather.end = this.toWeatherSummary(endData, activity.dateEnd, preferences)
                } catch (ex) {
                    logger.error("WeatherAPI.getActivityWeather", `Activity ${activity.id}, weather at end`, ex)
                }
            }

            return weather
        } catch (ex) {
            logger.error("WeatherAPI.getActivityWeather", `Activity ${activity.id}`, ex)
            throw ex
        }
    }

    /**
     * Transform data from the WeatherAPI API to a WeatherSummary.
     * @param data Data from WeatherAPI.
     * @param date Weather observation date.
     * @param preferences User preferences.
     */
    private toWeatherSummary = (data: any, date: Date, preferences: UserPreferences): WeatherSummary => {
        logger.debug("WeatherAPI.toWeatherSummary", data)

        const hour = date.getHours()
        const isDaylight = hour > 6 && hour < 19
        const cloudCover = data.cloud
        const humidity = data.humidity || data.avghumidity || null
        const pressure = data.pressure_mb || null
        let temperature, wind, precipType, iconText

        if (data.precip_mm > 0) {
            if (data.temp_c < 0) precipType = "snow"
            else if (data.temp_c < 3) precipType = "sleet"
            else precipType = "rain"
        }

        if (cloudCover < 10) {
            iconText = isDaylight ? "clear-day" : "clear-night"
        } else if (cloudCover < 50) {
            iconText = isDaylight ? "partly-cloudy-day" : "partly-cloudy-night"
        } else if (precipType) {
            iconText = precipType
        } else {
            iconText = "cloudy"
        }

        // Replace spaces with dashes on weather code.
        if (data.iconText) {
            data.iconText = data.iconText.replace(/ /g, "-")
        }

        // Get correct temperature based on weather units.
        if (preferences.weatherUnit == "f") {
            temperature = data.temp_f || data.avgtemp_f
            if (temperature) {
                temperature = temperature.toFixed(0) + "°F"
            }
            wind = data.wind_mph || data.maxwind_mph || null
            if (!isNaN(wind)) {
                wind = parseFloat(wind).toFixed(0) + " mph"
            }
        } else {
            temperature = data.temp_c || data.avgtemp_c
            if (temperature) {
                temperature = temperature.toFixed(0) + "°C"
            }
            wind = data.wind_kph || data.maxwind_kph || null
            if (!isNaN(wind)) {
                wind = parseFloat(wind).toFixed(0) + " kph"
            }
        }

        const result: WeatherSummary = {
            summary: data.condition ? data.condition.text : null,
            iconText: iconText,
            temperature: temperature,
            humidity: humidity ? parseInt(humidity).toFixed(0) + "%" : null,
            pressure: pressure ? parseInt(pressure) + "hPa" : null,
            windSpeed: wind,
            windBearing: data.wind_degree ? data.wind_degree : null,
            precipType: precipType || null
        }

        // Process and return weather summary.
        processWeatherSummary(result, date)
        return result
    }

    /**
     * Filter the response data from WeatherAPI and get details relevant to the specific date time.
     */
    private filterData = (data: any, date: Date) => {
        if (!data.current && !data.forecast) {
            return null
        }

        const mDate = moment(date)
        const dayFormat = "YYYY-MM-DD"
        const hourFormat = "YYYY-MM-DD HH:00"
        let result = null

        if (data.forecast) {
            result = _.find(data.forecast.forecastday, {date: mDate.format(dayFormat)})

            // Try finding the particular hour.
            if (result) {
                let hourData = _.find(result.hour, {date: mDate.format(hourFormat)})
                if (!hourData) hourData = _.find(result.hour, {date: mDate.subtract(1, "h").format(hourFormat)})
                if (!hourData) hourData = _.find(result.hour, {date: mDate.add(2, "h").format(hourFormat)})
                result = hourData || result.day
            }
        } else {
            result = data.current
        }

        if (!result) {
            throw new Error(`No data found for day ${mDate.format(dayFormat)}`)
        }

        // Return whatever data the API returned. Try hour, otherwise get the full day's data.
        return result
    }
}

// Exports...
export default WeatherAPI.Instance
