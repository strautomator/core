// Strautomator Core: Weather - Weatherbit

import {WeatherApiStats, WeatherProvider, WeatherSummary} from "./types"
import {getSuntimes, processWeatherSummary, weatherSummaryString} from "./utils"
import {UserPreferences} from "../users/types"
import {axiosRequest} from "../axios"
import logger = require("anyhow")
import dayjs from "../dayjs"
const settings = require("setmeup").settings

/**
 * Weatherbit weather API. Only supports current weather (no historical data).
 */
export class Weatherbit implements WeatherProvider {
    private constructor() {}
    private static _instance: Weatherbit
    static get Instance(): Weatherbit {
        return this._instance || (this._instance = new this())
    }
    apiRequest = null
    stats: WeatherApiStats = null

    name: string = "weatherbit"
    title: string = "Weatherbit"
    hoursPast: number = 1
    hoursFuture: number = 0

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

            const baseUrl = settings.weather.weatherbit.baseUrl
            const secret = settings.weather.weatherbit.secret
            const lang = preferences.language || "en"
            const weatherUrl = `${baseUrl}current?lat=${coordinates[0]}&lon=${coordinates[1]}&tz=local&lang=${lang}&units=M&key=${secret}`

            // Fetch weather data.
            logger.debug("Weatherbit.getWeather", weatherUrl)
            const res = await this.apiRequest.schedule(() => axiosRequest({url: weatherUrl}))

            // Parse result.
            const result = this.toWeatherSummary(res, coordinates, date, preferences)
            if (result) {
                logger.info("Weatherbit.getWeather", weatherSummaryString(coordinates, date, result, preferences))
            }

            return result
        } catch (ex) {
            logger.error("Weatherbit.getWeather", coordinates, isoDate, unit, ex)
            this.stats.errorCount++
            throw ex
        }
    }

    /**
     * Transform data from the Weatherbit API to a WeatherSummary.
     * @param data Data from Weatherbit.
     * @param preferences User preferences.
     */
    private toWeatherSummary = (data: any, coordinates: [number, number], date: Date, preferences: UserPreferences): WeatherSummary => {
        data = data.data ? data.data : null
        if (!data) return

        if (data.length > 1) {
            data = data.find((d) => d.datetime == dayjs.utc(date).format("YYYY-MM-DD:HH"))
        } else {
            data = data[0]
        }

        if (!data) return

        const code = data.weather.code.toString().substring(1)

        // Get correct icon text based on the wather code.
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
                iconText = ["610", "611"].indexOf(data.weather.code) < 0 ? "Snow" : "Sleet"
                break
            case "7":
                iconText = "Fog"
                break
            case "9":
                iconText = "Rain"
                break
        }

        const result: WeatherSummary = {
            provider: this.name,
            summary: data.weather.description,
            temperature: data.temp,
            feelsLike: data.app_temp,
            humidity: data.rh,
            pressure: data.pres,
            windSpeed: data.wind_spd,
            windDirection: data.wind_dir,
            precipitation: data.snow ? "Snow" : data.precip ? "Rain" : null,
            cloudCover: data.clouds,
            visibility: data.vis,
            extraData: {
                timeOfDay: getSuntimes(coordinates, date).timeOfDay,
                iconText: iconText,
                mmPrecipitation: data.snow || data.precip
            }
        }

        // Process and return weather summary.
        processWeatherSummary(result, date, preferences)
        return result
    }
}

// Exports...
export default Weatherbit.Instance
