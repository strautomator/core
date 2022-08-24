// Strautomator Core: WeatherAPI.com (NOT WORKING YET)

import {WeatherApiStats, WeatherProvider, WeatherSummary} from "./types"
import {getSuntimes, processWeatherSummary, weatherSummaryString} from "./utils"
import {UserPreferences} from "../users/types"
import {axiosRequest} from "../axios"
import _ = require("lodash")
import logger = require("anyhow")
import dayjs from "../dayjs"
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
    hoursPast: number = 1
    hoursFuture: number = 108

    // METHODS
    // --------------------------------------------------------------------------

    /**
     * Get current weather conditions for the specified coordinates.
     * @param coordinates Array with latitude and longitude.
     * @param date Date for the weather request.
     * @param preferences User preferences to get proper weather units.
     */
    getWeather = async (coordinates: [number, number], date: Date, preferences: UserPreferences): Promise<WeatherSummary> => {
        const unit = preferences && preferences.weatherUnit == "f" ? "imperial" : "metric"
        const isoDate = date.toISOString()
        const today = dayjs.utc()
        const diffHours = Math.abs(today.diff(date, "hours"))
        const isFuture = today.isBefore(date)
        const maxHours = isFuture ? this.hoursFuture : this.hoursPast

        try {
            if (diffHours > maxHours) throw new Error(`Date out of range: ${isoDate}`)
            if (!preferences) preferences = {}

            const baseUrl = settings.weather.weatherapi.baseUrl
            const secret = settings.weather.weatherapi.secret
            const startTime = dayjs.utc(date).unix()
            const lang = preferences.language || "en"
            const basePath = isFuture ? "forecast" : "current"
            const weatherUrl = `${baseUrl}${basePath}.json?key=${secret}&lang=${lang}&q=${coordinates.join(",")}&unixdt=${startTime}`

            // Fetch weather data.
            logger.debug("WeatherAPI.getWeather", weatherUrl)
            const res = await this.apiRequest.schedule(() => axiosRequest({url: weatherUrl}))

            // Parse result.
            const result = this.toWeatherSummary(res, coordinates, date, preferences)
            if (result) {
                logger.info("WeatherAPI.getWeather", weatherSummaryString(coordinates, date, result, preferences))
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
    private toWeatherSummary = (data: any, coordinates: [number, number], date: Date, preferences: UserPreferences): WeatherSummary => {
        data = this.filterData(data, date)
        if (!data) return

        // Set wind speed.
        let windSpeed = data.wind_kph || data.maxwind_kph || null

        // Make sure we don't have sunny at night :-)
        let summary = data.condition && data.condition.text ? data.condition.text.toLowerCase() : null
        if (data.is_day === 0) {
            if (summary == "sunny") summary = "Clear"
            else if (summary.indexOf("sunny") > 0) summary = summary.replace("Sunny", "Clear")
        }

        const result: WeatherSummary = {
            provider: this.name,
            summary: summary,
            temperature: data.temp_c || data.avgtemp_c || 0,
            feelsLike: data.feelslike_c,
            humidity: data.humidity || data.avghumidity || null,
            pressure: data.pressure_mb || null,
            windSpeed: windSpeed ? parseFloat(windSpeed) / 3.6 : null,
            windDirection: data.wind_degree || null,
            precipitation: null,
            cloudCover: data.cloud,
            visibility: data.avgvis_km || data.vis_km || 99,
            extraData: {
                timeOfDay: getSuntimes(coordinates, date).timeOfDay,
                mmPrecipitation: data.precip_mm
            }
        }

        // Process and return weather summary.
        processWeatherSummary(result, date, preferences)
        return result
    }

    /**
     * Filter the response data from WeatherAPI and get details relevant to the specific date time.
     */
    private filterData = (data: any, date: Date): any => {
        if (!data.current && !data.forecast) {
            return null
        }

        const mDate = dayjs(date)
        const dayFormat = "YYYY-MM-DD"
        const hourFormat = "YYYY-MM-DD HH:00"
        let result = null

        if (data.forecast) {
            result = _.find(data.forecast.forecastday, {date: mDate.format(dayFormat)})

            // Try finding the particular hour.
            if (result) {
                let hourData = _.find(result.hour, {time: mDate.format(hourFormat)})
                if (!hourData) hourData = _.find(result.hour, {time: mDate.subtract(1, "h").format(hourFormat)})
                if (!hourData) hourData = _.find(result.hour, {time: mDate.add(1, "h").format(hourFormat)})
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
