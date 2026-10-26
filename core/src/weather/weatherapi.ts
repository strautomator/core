// Strautomator Core: WeatherAPI.com (NOT WORKING YET)

import {WeatherApiStats, WeatherProvider, WeatherRoundTo, WeatherSummary} from "./types"
import {getSuntimes} from "./utils"
import {UserData} from "../users/types"
import {axiosRequest} from "../axios"
import _ from "lodash"
import logger from "anyhow"
import * as logHelper from "../loghelper"
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
     * @param user User requesting the data.
     * @param coordinates Array with latitude and longitude.
     * @param dDate Date for the weather request (as a DayJS object).
     * @param roundTo Round to the previous or next hour?
     */
    getWeather = async (user: UserData, coordinates: [number, number], dDate: dayjs.Dayjs, roundTo?: WeatherRoundTo): Promise<WeatherSummary> => {
        const unit = user.preferences.weatherUnit == "f" ? "imperial" : "metric"
        const isoDate = dDate.toISOString()
        const utcDate = dDate.utc()
        const utcNow = dayjs.utc()
        const diffHours = Math.abs(utcNow.diff(utcDate, "hours"))
        const isFuture = utcNow.isBefore(utcDate)
        const maxHours = isFuture ? this.hoursFuture : this.hoursPast

        try {
            if (diffHours > maxHours) throw new Error(`Date out of range: ${isoDate}`)

            const baseUrl = settings.weather.weatherapi.baseUrl
            const secret = settings.weather.weatherapi.secret
            let lang: string = user.preferences.language || "en"
            if (lang == "se") {
                lang = "sv"
            } else if (lang == "lt") {
                lang = "en"
            }
            const basePath = isFuture ? "forecast" : "current"
            const unixdt = isFuture ? `&unixdt=${utcDate.unix()}` : ""
            const weatherUrl = `${baseUrl}${basePath}.json?key=${secret}&lang=${lang}&aqi=yes&q=${coordinates.join(",")}${unixdt}`

            // Fetch weather data.
            logger.debug("WeatherAPI.getWeather", weatherUrl)
            const res = await this.apiRequest.schedule(() => axiosRequest({url: weatherUrl}))

            // Parse result.
            const result = this.toWeatherSummary(res, coordinates, dDate, roundTo)
            return result
        } catch (ex) {
            logger.error("WeatherAPI.getWeather", logHelper.user(user), coordinates, isoDate, unit, ex)
            this.stats.errorCount++
            throw ex
        }
    }

    /**
     * Transform data from the WeatherAPI API to a WeatherSummary.
     * @param rawData Raw data from WeatherAPI.
     * @param coordinates Array with latitude and longitude.
     * @param dDate The date (as a DayJS object).
     * @param roundTo Round to the previous or next hour?
     */
    private toWeatherSummary = (rawData: any, coordinates: [number, number], dDate: dayjs.Dayjs, roundTo?: WeatherRoundTo): WeatherSummary => {
        const data = this.filterData(rawData, dDate, roundTo)
        if (!data) return null

        // Set wind speed.
        let windSpeed = data.wind_kph || data.maxwind_kph || null
        let windGust = data.gust_kph || null

        // Make sure we don't have sunny at night :-)
        let summary = data.condition && data.condition.text ? data.condition.text.toLowerCase() : null
        if (data.is_day === 0) {
            if (summary == "sunny") summary = "Clear"
            else if (summary.indexOf("sunny") > 0) summary = summary.replace("Sunny", "Clear")
        }

        // Has air quality data?
        const airQuality = data["air_quality"] || {}

        const result: WeatherSummary = {
            provider: this.name,
            summary: summary,
            temperature: data.temp_c || data.avgtemp_c || 0,
            feelsLike: data.feelslike_c,
            humidity: data.humidity || data.avghumidity || null,
            dewPoint: data.dewpoint_c || null,
            pressure: data.pressure_mb || null,
            windSpeed: windSpeed ? parseFloat(windSpeed) / 3.6 : null,
            windGust: windGust ? parseFloat(windGust) / 3.6 : null,
            windDirection: data.wind_degree || null,
            precipitation: null,
            cloudCover: data.cloud,
            visibility: data.avgvis_km || data.vis_km || 99,
            aqi: airQuality["us-epa-index"] || null,
            extraData: {
                timeOfDay: getSuntimes(coordinates, dDate).timeOfDay,
                mmPrecipitation: data.precip_mm
            }
        }

        return result
    }

    /**
     * Filter the response data from WeatherAPI and get details relevant to the specific date time.
     */
    private filterData = (data: any, dDate: dayjs.Dayjs, roundTo?: WeatherRoundTo): any => {
        if (!data.current && !data.forecast) return null

        const dayFormat = "YYYY-MM-DD"
        const hourFormat = "YYYY-MM-DD HH:00"
        let result = null

        if (data.forecast) {
            result = _.find(data.forecast.forecastday, {date: dDate.utc().format(dayFormat)})

            // Try finding the particular hour.
            if (result) {
                let bestDate = dDate
                if (bestDate.minute() > 50 || (dDate.minute() > 30 && roundTo == WeatherRoundTo.NextHour)) {
                    bestDate = bestDate.add(1, "hour")
                }
                let hourData = _.find(result.hour, {time: bestDate.format(hourFormat)}) || _.find(result.hour, {time: bestDate.subtract(1, "h").format(hourFormat)})
                result = hourData || result.day
            }
        } else {
            result = data.current
        }

        if (!result) {
            throw new Error(`No data found for day ${dDate.format(dayFormat)}`)
        }

        // Return whatever data the API returned. Try hour, otherwise get the full day's data.
        return result
    }
}

// Exports...
export default WeatherAPI.Instance
