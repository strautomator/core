// Strautomator Core: Weather - OpenWeatherMap

import {WeatherApiStats, WeatherProvider, WeatherSummary} from "./types"
import {getSuntimes} from "./utils"
import {UserData} from "../users/types"
import {axiosRequest} from "../axios"
import logger = require("anyhow")
import _ from "lodash"
import dayjs from "../dayjs"
const settings = require("setmeup").settings

/**
 * OpenWeatherMap weather API. Only supports current weather (no historical data).
 */
export class OpenWeatherMap implements WeatherProvider {
    private constructor() {}
    private static _instance: OpenWeatherMap
    static get Instance(): OpenWeatherMap {
        return this._instance || (this._instance = new this())
    }
    apiRequest = null
    stats: WeatherApiStats = null

    name: string = "openweathermap"
    title: string = "OpenWeatherMap"
    hoursPast: number = 8760
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
        const isFuture = utcNow.subtract(1, "hours").isBefore(utcDate)
        const maxHours = isFuture ? this.hoursFuture : this.hoursPast

        try {
            if (diffHours > maxHours) throw new Error(`Date out of range: ${isoDate}`)

            const baseUrl = settings.weather.openweathermap.baseUrl
            const secret = settings.weather.openweathermap.secret
            const lang = user.preferences?.language || "en"
            const basePath = isFuture ? "?" : `/timemachine?dt=${utcDate.unix()}&`
            const weatherUrl = `${baseUrl}${basePath}appid=${secret}&lang=${lang}&lat=${coordinates[0]}&lon=${coordinates[1]}&units=metric&exclude=minutely,alerts`

            // Fetch weather data.
            logger.debug("OpenWeatherMap.getWeather", weatherUrl)
            const res = await this.apiRequest.schedule(() => axiosRequest({url: weatherUrl}))

            // Parse result.
            const result = this.toWeatherSummary(res, coordinates, dDate)
            return result
        } catch (ex) {
            logger.error("OpenWeatherMap.getWeather", `User ${user.id} ${user.displayName}`, coordinates, isoDate, unit, ex)
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

            const baseUrl = settings.weather.openweathermap.aqiBaseUrl
            const secret = settings.weather.openweathermap.secret
            const aqiUrl = `${baseUrl}?appid=${secret}&lat=${coordinates[0]}&lon=${coordinates[1]}`

            // Fetch weather data.
            logger.debug("OpenWeatherMap.getAirQuality", aqiUrl)
            const res = await this.apiRequest.schedule(() => axiosRequest({url: aqiUrl}))

            if (res) {
                const aiq = this.toAirQualityIndex(res, dDate)

                if (aiq !== null) {
                    logger.info("OpenWeatherMap.getAirQuality", `User ${user.id} ${user.displayName}`, coordinates.join(", "), dDate.format("lll"), `AIQ: ${aiq}`)
                    return aiq
                }
            }

            return null
        } catch (ex) {
            logger.error("OpenWeatherMap.getAirQuality", `User ${user.id} ${user.displayName}`, coordinates, isoDate, unit, ex)
            this.stats.errorCount++
            throw ex
        }
    }

    /**
     * Transform data from the OpenWeatherMap API to a WeatherSummary.
     * @param rawData Raw data from OpenWeatherMap.
     * @param coordinates Array with latitude and longitude.
     * @param dDate The date (as a DayJS object).
     * @param preferences The user preferences.
     */
    private toWeatherSummary = (rawData: any, coordinates: [number, number], dDate: dayjs.Dayjs): WeatherSummary => {
        if (!rawData) return null

        const dt = dDate.utc().unix()
        const finder = (d) => d.dt >= dt - 1800 && d.dt <= dt + 1800
        const data = rawData.data?.find(finder) || rawData.hourly?.find(finder) || rawData.daily?.find(finder) || rawData.current
        if (!data.weather) return null

        const weatherData = data.weather[0]
        const code = weatherData.icon.substring(1)

        // Get correct icon text based on the weather code.
        let iconText = null
        switch (code) {
            case "2":
                iconText = "Thunderstorm"
                break
            case "3":
            case "5":
                iconText = "Rain"
                break
            case "6":
                iconText = !["610", "611"].includes(weatherData.id) ? "Snow" : "Sleet"
                break
            case "7":
                iconText = "Fog"
                break
            case "9":
                iconText = "Rain"
                break
        }

        const mmSnow = data.snow ? data.snow["1h"] || data.snow : null
        const mmRain = data.rain ? data.rain["1h"] || data.rain : null
        const mmPrecipitation = _.isNil(mmSnow) ? mmRain : mmSnow

        // Parsed results.
        const result: WeatherSummary = {
            provider: this.name,
            summary: weatherData.description,
            temperature: data.temp?.day || data.temp,
            feelsLike: data.feels_like?.day || data.feels_like,
            humidity: data.humidity,
            pressure: data.pressure,
            windSpeed: data.wind_speed,
            windDirection: data.wind_deg,
            precipitation: mmSnow > 0 ? "Snow" : mmRain > 0 ? "Rain" : null,
            cloudCover: data.clouds,
            visibility: data.visibility,
            extraData: {
                timeOfDay: getSuntimes(coordinates, dDate).timeOfDay,
                iconText: iconText,
                mmPrecipitation: mmPrecipitation || null
            }
        }

        return result
    }

    /**
     * Fetch the AQI from the raw data.
     * @param rawData Raw data from OpenWeatherMap.
     * @param dDate The date (as a DayJS object).
     */
    private toAirQualityIndex = (rawData: any, dDate: dayjs.Dayjs): number => {
        if (!rawData) return null
        let data = rawData.list?.length > 0 ? rawData.list.find((d) => d.dt >= dDate.utc().unix()) || rawData.list[0] : rawData

        if (data.main?.aqi) {
            return data.main?.aqi
        }

        return null
    }
}

// Exports...
export default OpenWeatherMap.Instance
