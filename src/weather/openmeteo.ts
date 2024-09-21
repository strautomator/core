// Strautomator Core: Weather - Open-Meteo

import {WeatherApiStats, WeatherProvider, WeatherRoundTo, WeatherSummary} from "./types"
import {getSuntimes} from "./utils"
import {UserData} from "../users/types"
import {axiosRequest} from "../axios"
import logger from "anyhow"
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

            const baseUrl = settings.weather.openmeteo.baseUrl
            const dateFormat = utcDate.format("YYYY-MM-DD")
            const daysQuery = isFuture ? `start_date=${dateFormat}&end_date=${dateFormat}` : `past_days=${utcNow.dayOfYear() - utcNow.subtract(diffHours, "hours").dayOfYear()}`
            const currentQuery = diffHours < 1 ? "&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,wind_gusts_10m" : ""
            const weatherUrl = `${baseUrl}?latitude=${coordinates[0]}&longitude=${coordinates[1]}&${daysQuery}&wind_speed_unit=ms&hourly=temperature_2m,relative_humidity_2m,dew_point_2m,apparent_temperature,precipitation_probability,precipitation,weather_code,surface_pressure,cloud_cover,visibility,wind_speed_10m,wind_direction_10m,wind_gusts_10m${currentQuery}`

            // Fetch weather data.
            logger.debug("OpenMeteo.getWeather", weatherUrl)
            const res = await this.apiRequest.schedule(() => axiosRequest({url: weatherUrl}))

            // Parse result.
            const result = this.toWeatherSummary(res, coordinates, dDate, roundTo)
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
     * @param roundTo Round to the previous or next hour?
     */
    getAirQuality = async (user: UserData, coordinates: [number, number], dDate: dayjs.Dayjs, roundTo?: WeatherRoundTo): Promise<number> => {
        const unit = user.preferences.weatherUnit == "f" ? "imperial" : "metric"
        const isoDate = dDate.toISOString()
        const utcDate = dDate.utc()
        const utcNow = dayjs.utc()
        const diffHours = Math.abs(utcNow.diff(utcDate, "hours"))
        const isFuture = utcNow.isBefore(utcDate)
        const maxHours = isFuture ? this.hoursFuture : this.hoursPast

        try {
            if (diffHours > maxHours) throw new Error(`Date out of range: ${isoDate}`)

            const baseUrl = settings.weather.openmeteo.aqiBaseUrl
            const dateFormat = utcDate.format("YYYY-MM-DD")
            const daysQuery = isFuture ? `start_date=${dateFormat}&end_date=${dateFormat}` : `past_days=${utcNow.dayOfYear() - utcNow.subtract(diffHours, "hours").dayOfYear()}`
            const aqiUrl = `${baseUrl}?latitude=${coordinates[0]}&longitude=${coordinates[1]}&${daysQuery}&hourly=european_aqi,us_aqi`

            // Fetch air quality data.
            logger.debug("OpenMeteo.getAirQuality", aqiUrl)
            const res = await this.apiRequest.schedule(() => axiosRequest({url: aqiUrl}))

            if (res) {
                const aiq = this.toAirQualityIndex(res, dDate, roundTo)

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
     * @param roundTo Round to the previous or next hour?
     */
    private toWeatherSummary = (rawData: any, coordinates: [number, number], dDate: dayjs.Dayjs, roundTo?: WeatherRoundTo): WeatherSummary => {
        if (!rawData || !rawData.hourly) return null
        let data = rawData

        const utcDate = dDate.utc()
        const hour = utcDate.minute() > 30 && roundTo == WeatherRoundTo.NextHour ? utcDate.hour() + 1 : utcDate.hour()
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
            temperature: data.hourly.temperature_2m?.at(index),
            feelsLike: data.hourly.apparent_temperature?.at(index),
            humidity: data.hourly.relative_humidity_2m?.at(index),
            dewPoint: data.hourly.dew_point_2m?.at(index),
            pressure: data.hourly.pressure_msl?.at(index),
            windSpeed: data.hourly.wind_speed_10m?.at(index),
            windGust: data.hourly.wind_gusts_10m?.at(index),
            windDirection: data.hourly.wind_gusts_10m?.at(index),
            cloudCover: data.hourly.cloud_cover?.at(index),
            extraData: {
                timeOfDay: getSuntimes(coordinates, dDate).timeOfDay,
                mmPrecipitation: data.hourly.precipitation?.at(index)
            }
        }

        return result
    }

    /**
     * Fetch the AQI from the raw data.
     * @param rawData Raw data from Open-Meteo.
     * @param dDate The date (as a DayJS object).
     * @param roundTo Round to the previous or next hour?
     */
    private toAirQualityIndex = (rawData: any, dDate: dayjs.Dayjs, roundTo?: WeatherRoundTo): number => {
        if (!rawData || !rawData.hourly) return null
        let data = rawData

        const utcDate = dDate.utc()
        const hour = utcDate.minute() > 30 && roundTo == WeatherRoundTo.NextHour ? utcDate.hour() + 1 : utcDate.hour()
        const targetDate = utcDate.hour(hour).minute(0)
        const dateFormat = "YYYY-MM-DDTHH:mm"
        const exactDateFormat = targetDate.format(dateFormat)
        const previousDateFormat = targetDate.hour(hour - 1).format(dateFormat)
        const nextDateFormat = targetDate.hour(hour + 1).format(dateFormat)
        const index = data.hourly.time.findIndex((h) => h == exactDateFormat || h == previousDateFormat || h == nextDateFormat)

        // No valid hourly index found? Stop here.
        if (index == -1) return null

        const aqi = data.hourly.european_aqi?.at(index)
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
