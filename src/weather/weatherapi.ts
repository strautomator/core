// Strautomator Core: WeatherAPI.com (NOT WORKING YET)

import {WeatherApiStats, WeatherProvider, WeatherSummary} from "./types"
import {processWeatherSummary, weatherSummaryString} from "./utils"
import {UserPreferences} from "../users/types"
import {axiosRequest} from "../axios"
import _ = require("lodash")
import logger = require("anyhow")
import moment = require("moment")
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
    apiRequest = null
    stats: WeatherApiStats = null

    name: string = "weatherapi"
    title: string = "WeatherAPI.com"
    maxHours: number = 48

    // METHODS
    // --------------------------------------------------------------------------

    /**
     * Get current weather conditions for the specified coordinates.
     * @param coordinates Array with latitude and longitude.
     * @param preferences User preferences to get proper weather units.
     */
    getWeather = async (coordinates: [number, number], date: Date, preferences: UserPreferences): Promise<WeatherSummary> => {
        const unit = preferences && preferences.weatherUnit == "f" ? "imperial" : "metric"
        const isoDate = date.toISOString()

        try {
            if (!preferences) preferences = {}
            if (moment.utc().diff(date, "hours") > this.maxHours) throw new Error(`Date out of range: ${isoDate}`)

            const baseUrl = settings.weather.weatherapi.baseUrl
            const secret = settings.weather.weatherapi.secret
            const now = moment.utc().unix()
            const startTime = moment.utc(date).unix()
            const endTime = now < startTime + 7200 ? now : startTime + 7200
            const isHistory = startTime < now - 3600
            const apiPath = isHistory ? "history.json" : "current.json"
            const lang = preferences.language || "en"

            // If using the history endpoint, pass start and end times.
            let weatherUrl = `${baseUrl}${apiPath}?key=${secret}&lang=${lang}&q=${coordinates.join(",")}`
            if (isHistory) weatherUrl += `&unixdt=${startTime}&unixend_dt=${endTime}`

            // Fetch weather data.
            logger.debug("WeatherAPI.getWeather", weatherUrl)
            const res = await this.apiRequest.schedule(() => axiosRequest({url: weatherUrl}))

            // Parse result.
            const result = this.toWeatherSummary(res, date, preferences)
            if (result) {
                logger.info("WeatherAPI.getWeather", weatherSummaryString(coordinates, date, result))
            }

            return result
        } catch (ex) {
            logger.error("WeatherAPI.getWeather", coordinates, isoDate, unit, ex)
            this.stats.errorCount++
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
        logger.debug("WeatherAPI.toWeatherSummary", data, date, preferences.weatherUnit)

        data = this.filterData(data, date)
        if (!data) return

        let precipType = null
        if (data.precip_mm > 0) {
            if (data.temp_c < 0) precipType = "snow"
            else if (data.temp_c < 3) precipType = "sleet"
            else precipType = "rain"
        }

        // Replace spaces with dashes on weather code.
        if (data.iconText) {
            data.iconText = data.iconText.replace(/ /g, "-")
        }

        // Set wind speed.
        const wind = data.wind_kph || data.maxwind_kph || null

        const result: WeatherSummary = {
            summary: data.condition ? data.condition.text : null,
            temperature: data.temp_c || data.avgtemp_c,
            humidity: data.humidity || data.avghumidity || null,
            pressure: data.pressure_mb || null,
            windSpeed: wind ? parseFloat(wind) / 3.6 : null,
            windDirection: data.wind_degree ? data.wind_degree : null,
            precipType: precipType || null,
            cloudCover: data.cloud
        }

        // Process and return weather summary.
        processWeatherSummary(result, date, preferences)
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
