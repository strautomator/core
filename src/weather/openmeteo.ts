// Strautomator Core: Weather - Open-Meteo

import {WeatherApiStats, WeatherProvider, WeatherSummary} from "./types"
import {getSuntimes, processWeatherSummary, weatherSummaryString} from "./utils"
import {UserPreferences} from "../users/types"
import {axiosRequest} from "../axios"
import logger = require("anyhow")
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
    maxHours: number = 2160

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
        const diffHours = today.diff(date, "hours")

        try {
            if (!preferences) preferences = {}
            if (diffHours > this.maxHours) throw new Error(`Date out of range: ${isoDate}`)

            const baseUrl = settings.weather.openmeteo.baseUrl
            const pastDays = today.dayOfYear() - today.subtract(diffHours, "hours").dayOfYear()
            const weatherUrl = `${baseUrl}?latitude=${coordinates[0]}&longitude=${coordinates[1]}&past_days=${pastDays}&hourly=temperature_2m,relativehumidity_2m,apparent_temperature,pressure_msl,precipitation,weathercode,snow_depth,cloudcover,windspeed_10m,winddirection_10m,windgusts_10m&current_weather=true`

            // Fetch weather data.
            logger.debug("OpenMeteo.getWeather", weatherUrl)
            const res = await this.apiRequest.schedule(() => axiosRequest({url: weatherUrl}))

            // Parse result.
            const result = this.toWeatherSummary(res, coordinates, date, preferences)
            if (result) {
                logger.info("OpenMeteo.getWeather", weatherSummaryString(coordinates, date, result, preferences))
            }

            return result
        } catch (ex) {
            logger.error("OpenMeteo.getWeather", coordinates, isoDate, unit, ex)
            this.stats.errorCount++
            throw ex
        }
    }

    /**
     * Transform data from the Open-Meteo API to a WeatherSummary.
     * @param data Data from Open-Meteo.
     * @param preferences User preferences.
     */
    private toWeatherSummary = (data: any, coordinates: [number, number], date: Date, preferences: UserPreferences): WeatherSummary => {
        if (!data || !data.hourly) return

        const baseDate = dayjs.utc(date)
        const hour = baseDate.minute() < 30 ? baseDate.hour() : baseDate.hour() + 1
        const dateFormat = baseDate.hour(hour).minute(0).format("YYYY-MM-DDTHH:mm")
        const index = data.hourly.time.findIndex((h) => dateFormat == h)

        const result: WeatherSummary = {
            provider: this.name,
            summary: null,
            temperature: data.hourly.temperature_2m[index],
            feelsLike: data.hourly.apparent_temperature[index],
            humidity: data.hourly.relativehumidity_2m[index],
            pressure: data.hourly.pressure_msl[index],
            windSpeed: data.hourly.windspeed_10m[index],
            windDirection: data.hourly.winddirection_10m[index],
            cloudCover: data.hourly.cloudcover[index],
            extraData: {
                timeOfDay: getSuntimes(coordinates, date).timeOfDay,
                mmPrecipitation: data.hourly.precipitation[index]
            }
        }

        // Process and return weather summary.
        processWeatherSummary(result, date, preferences)
        return result
    }
}

// Exports...
export default OpenMeteo.Instance
