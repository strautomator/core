// Strautomator Core: Weather - Weatherbit

import {WeatherApiStats, WeatherProvider, WeatherSummary} from "./types"
import {processWeatherSummary, weatherSummaryString} from "./utils"
import {UserPreferences} from "../users/types"
import {axiosRequest} from "../axios"
import logger = require("anyhow")
import dayjs from "dayjs"
import dayjsUTC from "dayjs/plugin/utc"
const settings = require("setmeup").settings

// Extends dayjs with UTC.
dayjs.extend(dayjsUTC)

/**
 * Weatherbit weather API. Only supports ccurrent weather (no historical data).
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
    maxHours: number = 1

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
            if (dayjs.utc().diff(date, "hours") > this.maxHours) throw new Error(`Date out of range: ${isoDate}`)

            const baseUrl = settings.weather.weatherbit.baseUrl
            const secret = settings.weather.weatherbit.secret
            const lang = preferences.language || "en"
            const weatherUrl = `${baseUrl}?lat=${coordinates[0]}&lon=${coordinates[1]}&tz=local&lang=${lang}&units=M&key=${secret}`

            // Fetch weather data.
            logger.debug("Weatherbit.getWeather", weatherUrl)
            const res = await this.apiRequest.schedule(() => axiosRequest({url: weatherUrl}))

            // Parse result.
            const result = this.toWeatherSummary(res, date, preferences)
            if (result) {
                logger.info("Weatherbit.getWeather", weatherSummaryString(coordinates, date, result))
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
    private toWeatherSummary = (data: any, date: Date, preferences: UserPreferences): WeatherSummary => {
        logger.debug("Weatherbit.toWeatherSummary", data, date, preferences.weatherUnit)

        // Check if received data is valid.
        data = data.data ? data.data[0] : null
        if (!data) return

        const code = data.weather.code.toString().substring(1)

        // Get correct icon text based on the wather code.
        let iconText
        switch (code) {
            case "2":
                iconText = "thunderstorm"
                break
            case "3":
            case "5":
                iconText = "rain"
                break
            case "6":
                iconText = ["610", "611"].indexOf(data.weather.code) < 0 ? "snow" : "sleet"
                break
            case "7":
                iconText = "fog"
                break
            case "8":
                iconText = ["800", "801"].indexOf(data.weather.code) < 0 ? "cloudy" : "clear-day"
                break
            case "9":
                iconText = "rain"
                break
            default:
                iconText = "cloudy"
        }

        const result: WeatherSummary = {
            summary: data.weather.description,
            temperature: data.temp,
            feelsLike: data.app_temp,
            humidity: data.rh,
            pressure: data.pres,
            windSpeed: data.wind_spd,
            windDirection: data.wind_dir,
            precipitation: data.snow ? "snow" : null,
            cloudCover: data.clouds,
            extraData: {
                iconText: iconText,
                mmPrecipitation: data.snow || data.precip,
                visibility: data.vis
            }
        }

        // Process and return weather summary.
        processWeatherSummary(result, date, preferences)
        return result
    }
}

// Exports...
export default Weatherbit.Instance
