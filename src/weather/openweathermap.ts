// Strautomator Core: Weather - OpenWeatherMap

import {WeatherApiStats, WeatherProvider, WeatherSummary} from "./types"
import {getSuntimes, processWeatherSummary, weatherSummaryString} from "./utils"
import {UserPreferences} from "../users/types"
import {axiosRequest} from "../axios"
import logger = require("anyhow")
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
    hoursPast: number = 1
    hoursFuture: number = 108

    // METHODS
    // --------------------------------------------------------------------------

    /**
     * Get current weather conditions for the specified coordinates.
     * @param coordinates Array with latitude and longitude.
     * @param dDate Date for the weather request (as a DayJS object).
     * @param preferences User preferences to get proper weather units.
     */
    getWeather = async (coordinates: [number, number], dDate: dayjs.Dayjs, preferences: UserPreferences): Promise<WeatherSummary> => {
        const unit = preferences && preferences.weatherUnit == "f" ? "imperial" : "metric"
        const isoDate = dDate.toISOString()
        const utcDate = dDate.utc()
        const utcNow = dayjs.utc()
        const diffHours = Math.abs(utcNow.diff(utcDate, "hours"))
        const isFuture = utcNow.isBefore(utcDate)
        const maxHours = isFuture ? this.hoursFuture : this.hoursPast

        try {
            if (diffHours > maxHours) throw new Error(`Date out of range: ${isoDate}`)
            if (!preferences) preferences = {}

            const baseUrl = settings.weather.openweathermap.baseUrl
            const secret = settings.weather.openweathermap.secret
            const lang = preferences.language || "en"
            const basePath = isFuture ? "forecast" : "weather"
            const weatherUrl = `${baseUrl}${basePath}?appid=${secret}&units=metric&lang=${lang}&lat=${coordinates[0]}&lon=${coordinates[1]}`

            // Fetch weather data.
            logger.debug("OpenWeatherMap.getWeather", weatherUrl)
            const res = await this.apiRequest.schedule(() => axiosRequest({url: weatherUrl}))

            // Parse result.
            const result = this.toWeatherSummary(res, coordinates, dDate, preferences)
            if (result) {
                logger.debug("OpenWeatherMap.getWeather", weatherSummaryString(coordinates, dDate, result, preferences))
            }

            return result
        } catch (ex) {
            logger.error("OpenWeatherMap.getWeather", coordinates, isoDate, unit, ex)
            this.stats.errorCount++
            throw ex
        }
    }

    /**
     * Transform data from the OpenWeatherMap API to a WeatherSummary.
     * @param data Data from OpenWeatherMap.
     * @param coordinates Array with latitude and longitude.
     * @param dDate The date (as a DayJS object).
     * @param preferences The user preferences.
     */
    private toWeatherSummary = (data: any, coordinates: [number, number], dDate: dayjs.Dayjs, preferences: UserPreferences): WeatherSummary => {
        if (!data) return
        if (data.list) {
            data = data.list.find((d) => d.dt > dDate.utc().unix())
        }
        if (!data) return

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

        // Get snow or rain.
        const mmSnow = data.snow ? data.snow["1h"] : 0
        const mmRain = data.rain ? data.rain["1h"] : 0

        const result: WeatherSummary = {
            provider: this.name,
            summary: weatherData.description,
            temperature: data.main.temp,
            feelsLike: data.main.feels_like,
            humidity: data.main.humidity,
            pressure: data.main.pressure,
            windSpeed: data.wind.speed,
            windDirection: data.wind.deg,
            precipitation: data.snow && data.snow["1h"] ? "Snow" : data.rain ? "Rain" : null,
            cloudCover: data.clouds ? data.clouds.all : null,
            visibility: data.visibility,
            extraData: {
                timeOfDay: getSuntimes(coordinates, dDate).timeOfDay,
                iconText: iconText,
                mmPrecipitation: mmSnow || mmRain
            }
        }

        // Process and return weather summary.
        processWeatherSummary(result, dDate, preferences)
        return result
    }
}

// Exports...
export default OpenWeatherMap.Instance
