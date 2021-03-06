// Strautomator Core: Weather - ClimaCell

import {WeatherProvider, WeatherSummary} from "./types"
import {processWeatherSummary, weatherSummaryString} from "./utils"
import {UserPreferences} from "../users/types"
import {axiosRequest} from "../axios"
import logger = require("anyhow")
import moment = require("moment")
const settings = require("setmeup").settings

/**
 * ClimaCell weather API.
 */
export class ClimaCell implements WeatherProvider {
    private constructor() {}
    private static _instance: ClimaCell
    static get Instance(): ClimaCell {
        return this._instance || (this._instance = new this())
    }
    apiRequest = null
    stats = null

    name: string = "climacell"
    title: string = "ClimaCell"
    maxHours: number = 6

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
            if (moment.utc().diff(date, "hours") > this.maxHours) throw new Error(`Date out of range: ${isoDate}`)

            const baseUrl = settings.weather.climacell.baseUrl
            const secret = settings.weather.climacell.secret
            const dateFormat = "YYYY-MM-DDTHH:mm:ss"
            const mDate = moment.utc(date)
            const startTime = mDate.format(dateFormat) + "Z"
            const endTime = mDate.add(1, "h").format(dateFormat) + "Z"
            const fields = `weatherCode,temperature,humidity,windSpeed,windDirection,pressureSurfaceLevel,precipitationType,cloudCover`
            const latlon = coordinates.join(",")
            const weatherUrl = `${baseUrl}timelines?&location=${latlon}&timesteps=1h&startTime=${startTime}&endTime=${endTime}&fields=${fields}&apikey=${secret}`

            // Fetch weather data.
            logger.debug("ClimaCell.getWeather", weatherUrl)
            const res = await this.apiRequest.schedule(() => axiosRequest({url: weatherUrl}))

            // Parse result.
            const result = this.toWeatherSummary(res, date, preferences)
            if (result) {
                logger.info("ClimaCell.getWeather", weatherSummaryString(coordinates, date, result))
            }

            return this.toWeatherSummary(result, date, preferences)
        } catch (ex) {
            logger.error("ClimaCell.getWeather", coordinates, isoDate, unit, ex)
            throw ex
        }
    }

    /**
     * Transform data from the ClimaCell API to a WeatherSummary.
     * @param data Data from ClimaCell.
     */
    private toWeatherSummary = (data: any, date: Date, preferences: UserPreferences): WeatherSummary => {
        logger.debug("ClimaCell.toWeatherSummary", data, date, preferences.weatherUnit)

        // Check if received data is valid.
        data = data.data && data.data.timelines ? data.data.timelines[0].intervals[0].values : null
        if (!data) return

        const hasPrecip = data.precipitationType && data.precipitationType > 0
        const precipType = hasPrecip ? this.fieldDescriptors.precipitationType[data.precipitationType] : null

        // Get correct icon text based on the weatherCode.
        let summary = data.weatherCode ? this.fieldDescriptors.weatherCode[data.weatherCode] : null
        let iconText = summary ? summary.toLowerCase() : null

        // Replace spaces with dashes on weather code.
        if (iconText) {
            iconText = iconText.replace(/ /gi, "-").toLowerCase()
        }

        const result: WeatherSummary = {
            summary: summary,
            iconText: iconText,
            temperature: data.temperature,
            humidity: data.humidity,
            pressure: data.pressureSurfaceLevel,
            windSpeed: data.windSpeed,
            windDirection: data.windDirection,
            precipType: precipType,
            cloudCover: data.cloudCover
        }

        // Process and return weather summary.
        processWeatherSummary(result, date, preferences)
        return result
    }

    // INTERNAL HELPERS
    // --------------------------------------------------------------------------

    /**
     * Field descriptors from ClimaCell.
     */
    private fieldDescriptors = {
        moonPhase: {
            "0": "New",
            "1": "Waxing Crescent",
            "2": "First Quarter",
            "3": "Waxing Gibbous",
            "4": "Full",
            "5": "Waning Gibbous",
            "6": "Third Quarter",
            "7": "Waning Crescent"
        },
        precipitationType: {
            "0": "None",
            "1": "Rain",
            "2": "Snow",
            "3": "Freezing Rain",
            "4": "Ice Pellets"
        },
        weatherCode: {
            "0": "Unknown",
            "1000": "Clear",
            "1001": "Cloudy",
            "1100": "Mostly Clear",
            "1101": "Partly Cloudy",
            "1102": "Mostly Cloudy",
            "2000": "Fog",
            "2100": "Light Fog",
            "3000": "Light Wind",
            "3001": "Wind",
            "3002": "Strong Wind",
            "4000": "Drizzle",
            "4001": "Rain",
            "4200": "Light Rain",
            "4201": "Heavy Rain",
            "5000": "Snow",
            "5001": "Flurries",
            "5100": "Light Snow",
            "5101": "Heavy Snow",
            "6000": "Freezing Drizzle",
            "6001": "Freezing Rain",
            "6200": "Light Freezing Rain",
            "6201": "Heavy Freezing Rain",
            "7000": "Ice Pellets",
            "7101": "Heavy Ice Pellets",
            "7102": "Light Ice Pellets",
            "8000": "Thunderstorm"
        }
    }
}

// Exports...
export default ClimaCell.Instance
