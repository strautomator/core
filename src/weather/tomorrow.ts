// Strautomator Core: Weather - Tomorrow

import {WeatherApiStats, WeatherProvider, WeatherSummary} from "./types"
import {processWeatherSummary, weatherSummaryString} from "./utils"
import {UserPreferences} from "../users/types"
import {axiosRequest} from "../axios"
import logger = require("anyhow")
import dayjs from "../dayjs"
const settings = require("setmeup").settings

/**
 * Tomorrow weather API.
 */
export class Tomorrow implements WeatherProvider {
    private constructor() {}
    private static _instance: Tomorrow
    static get Instance(): Tomorrow {
        return this._instance || (this._instance = new this())
    }
    apiRequest = null
    stats: WeatherApiStats = null

    name: string = "tomorrow"
    title: string = "Tomorrow"
    maxHours: number = 5

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

            const baseUrl = settings.weather.tomorrow.baseUrl
            const secret = settings.weather.tomorrow.secret
            const dateFormat = "YYYY-MM-DDTHH:mm:ss"
            const mDate = dayjs.utc(date)
            const startTime = mDate.format(dateFormat) + "Z"
            const endTime = mDate.add(1, "h").format(dateFormat) + "Z"
            const fields = `weatherCode,temperature,humidity,windSpeed,windDirection,pressureSurfaceLevel,precipitationType,cloudCover`
            const latlon = coordinates.join(",")
            const weatherUrl = `${baseUrl}timelines?&location=${latlon}&timesteps=1h&startTime=${startTime}&endTime=${endTime}&fields=${fields}&apikey=${secret}`

            // Fetch weather data.
            logger.debug("Tomorrow.getWeather", weatherUrl)
            const res = await this.apiRequest.schedule(() => axiosRequest({url: weatherUrl}))

            // Parse result.
            const result = this.toWeatherSummary(res, date, preferences)
            if (result) {
                logger.info("Tomorrow.getWeather", weatherSummaryString(coordinates, date, result))
            }

            return result
        } catch (ex) {
            logger.error("Tomorrow.getWeather", coordinates, isoDate, unit, ex)
            this.stats.errorCount++
            throw ex
        }
    }

    /**
     * Transform data from the Tomorrow API to a WeatherSummary.
     * @param data Data from Tomorrow.
     */
    private toWeatherSummary = (data: any, date: Date, preferences: UserPreferences): WeatherSummary => {
        logger.debug("Tomorrow.toWeatherSummary", data, date, preferences.weatherUnit)

        // Check if received data is valid.
        data = data.data && data.data.timelines ? data.data.timelines[0].intervals[0].values : null
        if (!data) return

        const hasPrecip = data.precipitationType && data.precipitationType > 0
        const precipitation = hasPrecip ? this.fieldDescriptors.precipitationType[data.precipitationType] : null

        // Get correct icon text based on the weatherCode.
        const summary = data.weatherCode ? this.fieldDescriptors.weatherCode[data.weatherCode] : null
        const iconText = summary ? summary.replace(/ /gi, "-").toLowerCase() : null

        const result: WeatherSummary = {
            summary: summary,
            temperature: data.temperature,
            feelsLike: data.temperatureApparent,
            humidity: data.humidity,
            pressure: data.pressureSurfaceLevel,
            windSpeed: data.windSpeed,
            windDirection: data.windDirection,
            precipitation: precipitation,
            cloudCover: data.cloudCover,
            extraData: {
                iconText: iconText,
                mmPrecipitation: data.precipitationIntensity,
                visibility: data.visibility
            }
        }

        // Process and return weather summary.
        processWeatherSummary(result, date, preferences)
        return result
    }

    // INTERNAL HELPERS
    // --------------------------------------------------------------------------

    /**
     * Field descriptors from Tomorrow.
     */
    private fieldDescriptors = {
        precipitationType: {
            "0": "dry",
            "1": "rain",
            "2": "snow",
            "3": "freezing rain",
            "4": "ice pellets"
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
export default Tomorrow.Instance
