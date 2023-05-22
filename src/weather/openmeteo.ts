// Strautomator Core: Weather - Open-Meteo

import {WeatherApiStats, WeatherProvider, WeatherSummary} from "./types"
import {getSuntimes} from "./utils"
import {UserData} from "../users/types"
import {axiosRequest} from "../axios"
import logger = require("anyhow")
import * as logHelper from "../loghelper"
import dayjs from "../dayjs"
const settings = require("setmeup").settings

/**
 * Open-Meteo weather API. Supports up to 2 past days.
 */
export class OpenMeteo implements WeatherProvider {
    private constructor() {}
    private static _instance: OpenMeteo
    static get Instance(): OpenMeteo {
        return this._instance || (this._instance = new this())
    }
    apiRequest = null
    stats: WeatherApiStats = null

    name: string = "openmeteo"
    title: string = "Open-Meteo"
    hoursPast: number = 2160
    hoursFuture: number = 160

    // METHODS
    // --------------------------------------------------------------------------

    /**
     * Get current weather conditions for the specified coordinates.
     * @param user User requesting the data.
     * @param coordinates Array with latitude and longitude.
     * @param dDate Date for the weather request (as a DayJS object).
     */
    getWeather = async (user: UserData, coordinates: [number, number], dDate: dayjs.Dayjs): Promise<WeatherSummary> => {
        const unit = user.preferences?.weatherUnit == "f" ? "imperial" : "metric"
        const isoDate = dDate.toISOString()
        const utcDate = dDate.utc()
        const utcNow = dayjs.utc()
        const diffHours = Math.abs(utcNow.diff(utcDate, "hours"))
        const isFuture = utcNow.isBefore(utcDate)
        const maxHours = isFuture ? this.hoursFuture : this.hoursPast

        try {
            if (diffHours > maxHours) throw new Error(`Date out of range: ${isoDate}`)

            const baseUrl = settings.weather.openmeteo.baseUrl
            const dateFormat = dDate.format("YYYY-MM-DD")
            const daysQuery = isFuture ? `start_date=${dateFormat}&end_date=${dateFormat}` : `past_days=${utcNow.dayOfYear() - utcNow.subtract(diffHours, "hours").dayOfYear()}`
            const weatherUrl = `${baseUrl}?latitude=${coordinates[0]}&longitude=${coordinates[1]}&${daysQuery}&hourly=temperature_2m,relativehumidity_2m,apparent_temperature,pressure_msl,precipitation,weathercode,snow_depth,cloudcover,windspeed_10m,windspeed_80m,winddirection_10m,winddirection_80m,windgusts_10m&windspeed_unit=ms&current_weather=true`

            // Fetch weather data.
            logger.debug("OpenMeteo.getWeather", weatherUrl)
            const res = await this.apiRequest.schedule(() => axiosRequest({url: weatherUrl}))

            // Parse result.
            const result = this.toWeatherSummary(res, coordinates, dDate)
            return result
        } catch (ex) {
            logger.error("OpenMeteo.getWeather", logHelper.user(user), coordinates, isoDate, unit, ex)
            this.stats.errorCount++
            throw ex
        }
    }

    /**
     * Get air quality for the specified coordinates.
     * @param user User requesting the data.
     * @param coordinates Array with latitude and longitude.
     * @param dDate Date for the weather request (as a DayJS object).
     */
    getAirQuality = async (user: UserData, coordinates: [number, number], dDate: dayjs.Dayjs): Promise<number> => {
        const unit = user.preferences?.weatherUnit == "f" ? "imperial" : "metric"
        const isoDate = dDate.toISOString()
        const utcDate = dDate.utc()
        const utcNow = dayjs.utc()
        const diffHours = Math.abs(utcNow.diff(utcDate, "hours"))
        const isFuture = utcNow.isBefore(utcDate)
        const maxHours = isFuture ? this.hoursFuture : this.hoursPast

        try {
            if (diffHours > maxHours) throw new Error(`Date out of range: ${isoDate}`)

            const baseUrl = settings.weather.openmeteo.aqiBaseUrl
            const dateFormat = dDate.format("YYYY-MM-DD")
            const daysQuery = isFuture ? `start_date=${dateFormat}&end_date=${dateFormat}` : `past_days=${utcNow.dayOfYear() - utcNow.subtract(diffHours, "hours").dayOfYear()}`
            const aqiUrl = `${baseUrl}?latitude=${coordinates[0]}&longitude=${coordinates[1]}&${daysQuery}&hourly=european_aqi,us_aqi`

            // Fetch air quality data.
            logger.debug("OpenMeteo.getAirQuality", aqiUrl)
            const res = await this.apiRequest.schedule(() => axiosRequest({url: aqiUrl}))

            if (res) {
                const aiq = this.toAirQualityIndex(res, dDate)

                if (aiq !== null) {
                    logger.info("OpenMeteo.getAirQuality", logHelper.user(user), coordinates.join(", "), dDate.format("lll"), `AIQ: ${aiq}`)
                    return aiq
                }
            }

            return null
        } catch (ex) {
            logger.error("OpenMeteo.getAirQuality", logHelper.user(user), coordinates, isoDate, unit, ex)
            this.stats.errorCount++
            throw ex
        }
    }

    /**
     * Transform data from the Open-Meteo API to a WeatherSummary.
     * @param rawData Raw data from Open-Meteo.
     * @param coordinates Array with latitude and longitude.
     * @param dDate The date (as a DayJS object).
     * @param preferences The user preferences.
     */
    private toWeatherSummary = (rawData: any, coordinates: [number, number], dDate: dayjs.Dayjs): WeatherSummary => {
        if (!rawData || !rawData.hourly) return null
        let data = rawData

        const utcDate = dDate.utc()
        const hour = utcDate.minute() < 30 ? utcDate.hour() : utcDate.hour() + 1
        const targetDate = utcDate.hour(hour).minute(0)
        const dateFormat = "YYYY-MM-DDTHH:mm"
        const exactDateFormat = targetDate.format(dateFormat)
        const previousDateFormat = targetDate.hour(hour - 1).format(dateFormat)
        const nextDateFormat = targetDate.hour(hour + 1).format(dateFormat)
        const index = data.hourly.time.findIndex((h) => h == exactDateFormat || h == previousDateFormat || h == nextDateFormat)

        // No valid hourly index found? Stop here.
        if (index == -1) return null

        const result: WeatherSummary = {
            provider: this.name,
            summary: null,
            temperature: data.hourly.temperature_2m[index],
            feelsLike: data.hourly.apparent_temperature[index],
            humidity: data.hourly.relativehumidity_2m[index],
            pressure: data.hourly.pressure_msl[index],
            windSpeed: data.hourly.windspeed_10m[index] || data.hourly.windspeed_80m[index],
            windDirection: data.hourly.winddirection_10m[index] || data.hourly.winddirection_80m[index],
            cloudCover: data.hourly.cloudcover[index],
            extraData: {
                timeOfDay: getSuntimes(coordinates, dDate).timeOfDay,
                mmPrecipitation: data.hourly.precipitation[index]
            }
        }

        return result
    }

    /**
     * Fetch the AQI from the raw data.
     * @param rawData Raw data from Open-Meteo.
     * @param dDate The date (as a DayJS object).
     */
    private toAirQualityIndex = (rawData: any, dDate: dayjs.Dayjs): number => {
        if (!rawData || !rawData.hourly) return null
        let data = rawData

        const utcDate = dDate.utc()
        const hour = utcDate.minute() < 30 ? utcDate.hour() : utcDate.hour() + 1
        const targetDate = utcDate.hour(hour).minute(0)
        const dateFormat = "YYYY-MM-DDTHH:mm"
        const exactDateFormat = targetDate.format(dateFormat)
        const previousDateFormat = targetDate.hour(hour - 1).format(dateFormat)
        const nextDateFormat = targetDate.hour(hour + 1).format(dateFormat)
        const index = data.hourly.time.findIndex((h) => h == exactDateFormat || h == previousDateFormat || h == nextDateFormat)

        // No valid hourly index found? Stop here.
        if (index == -1) return null

        const aqi = data.hourly.european_aqi[index]
        if (aqi > 300) return 5
        if (aqi > 200) return 4
        if (aqi > 150) return 3
        if (aqi > 100) return 2
        if (aqi > 50) return 1
        return 0
    }
}

// Exports...
export default OpenMeteo.Instance
