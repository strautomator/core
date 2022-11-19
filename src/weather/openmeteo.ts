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
    hoursPast: number = 2160
    hoursFuture: number = 160

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

            const baseUrl = settings.weather.openmeteo.baseUrl
            const dateFormat = dDate.format("YYYY-MM-DD")
            const daysQuery = isFuture ? `start_date=${dateFormat}&end_date=${dateFormat}` : `past_days=${utcNow.dayOfYear() - utcNow.subtract(diffHours, "hours").dayOfYear()}`
            const weatherUrl = `${baseUrl}?latitude=${coordinates[0]}&longitude=${coordinates[1]}&${daysQuery}&hourly=temperature_2m,relativehumidity_2m,apparent_temperature,pressure_msl,precipitation,weathercode,snow_depth,cloudcover,windspeed_10m,winddirection_10m,windgusts_10m&current_weather=true`

            // Fetch weather data.
            logger.debug("OpenMeteo.getWeather", weatherUrl)
            const res = await this.apiRequest.schedule(() => axiosRequest({url: weatherUrl}))

            // Parse result.
            const result = this.toWeatherSummary(res, coordinates, dDate, preferences)
            if (result) {
                logger.debug("OpenMeteo.getWeather", weatherSummaryString(coordinates, dDate, result, preferences))
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
     * @param coordinates Array with latitude and longitude.
     * @param dDate The date (as a DayJS object).
     * @param preferences The user preferences.
     */
    private toWeatherSummary = (data: any, coordinates: [number, number], dDate: dayjs.Dayjs, preferences: UserPreferences): WeatherSummary => {
        if (!data || !data.hourly) return

        const utcDate = dDate.utc()
        const hour = utcDate.minute() < 30 ? utcDate.hour() : utcDate.hour() + 1
        const dateFormat = utcDate.hour(hour).minute(0).format("YYYY-MM-DDTHH:mm")
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
                timeOfDay: getSuntimes(coordinates, dDate).timeOfDay,
                mmPrecipitation: data.hourly.precipitation[index]
            }
        }

        // Process and return weather summary.
        processWeatherSummary(result, dDate, preferences)
        return result
    }
}

// Exports...
export default OpenMeteo.Instance
