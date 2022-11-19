// Strautomator Core: Weather - Tomorrow.io

import {WeatherApiStats, WeatherProvider, WeatherSummary} from "./types"
import {getSuntimes, processWeatherSummary, weatherSummaryString} from "./utils"
import {UserPreferences} from "../users/types"
import {axiosRequest} from "../axios"
import {translation} from "../translations"
import logger = require("anyhow")
import dayjs from "../dayjs"
const settings = require("setmeup").settings

/**
 * Tomorrow.io weather API.
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
    title: string = "Tomorrow.io"
    hoursPast: number = 5
    hoursFuture: number = 168

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

            const baseUrl = settings.weather.tomorrow.baseUrl
            const secret = settings.weather.tomorrow.secret
            const dateFormat = "YYYY-MM-DDTHH:mm:ss"
            const startTime = utcDate.format(dateFormat) + "Z"
            const endTime = utcDate.add(1, "h").format(dateFormat) + "Z"
            const fields = `weatherCode,temperature,humidity,windSpeed,windDirection,pressureSurfaceLevel,precipitationType,cloudCover,visibility`
            const latlon = coordinates.join(",")
            const weatherUrl = `${baseUrl}timelines?&location=${latlon}&timesteps=1h&startTime=${startTime}&endTime=${endTime}&fields=${fields}&apikey=${secret}`

            // Fetch weather data.
            logger.debug("Tomorrow.getWeather", weatherUrl)
            const res = await this.apiRequest.schedule(() => axiosRequest({url: weatherUrl}))

            // Parse result.
            const result = this.toWeatherSummary(res, coordinates, dDate, preferences)
            if (result) {
                logger.debug("Tomorrow.getWeather", weatherSummaryString(coordinates, dDate, result, preferences))
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
     * @param coordinates Array with latitude and longitude.
     * @param dDate The date (as a DayJS object).
     * @param preferences The user preferences.
     */
    private toWeatherSummary = (data: any, coordinates: [number, number], dDate: dayjs.Dayjs, preferences: UserPreferences): WeatherSummary => {
        data = data.data && data.data.timelines ? data.data.timelines[0].intervals[0].values : null
        if (!data) return

        const hasPrecip = data.precipitationType && data.precipitationType > 0
        const precipitation = hasPrecip ? this.fieldDescriptors.precipitationType[data.precipitationType] : null

        // Get correct summary / icon text based on the weatherCode.
        const summary = data.weatherCode ? this.fieldDescriptors.weatherCode[data.weatherCode] : null

        const result: WeatherSummary = {
            provider: this.name,
            summary: summary,
            temperature: data.temperature,
            feelsLike: data.temperatureApparent,
            humidity: data.humidity,
            pressure: data.pressureSurfaceLevel,
            windSpeed: data.windSpeed,
            windDirection: data.windDirection,
            cloudCover: data.cloudCover,
            visibility: data.visibility,
            extraData: {
                timeOfDay: getSuntimes(coordinates, dDate).timeOfDay,
                iconText: summary,
                mmPrecipitation: data.precipitationIntensity
            }
        }

        if (precipitation) {
            result.precipitation = translation(precipitation, preferences)
        }

        // Process and return weather summary.
        processWeatherSummary(result, dDate, preferences)
        return result
    }

    // INTERNAL HELPERS
    // --------------------------------------------------------------------------

    /**
     * Field descriptors from Tomorrow.
     */
    private fieldDescriptors = {
        precipitationType: {
            "0": "Dry",
            "1": "Rain",
            "2": "Snow",
            "3": "Sleet",
            "4": "Sleet"
        },
        weatherCode: {
            "0": "Unknown",
            "1000": "Clear",
            "1001": "Cloudy",
            "1100": "MostlyClear",
            "1101": "Cloudy",
            "1102": "MostlyCloudy",
            "2000": "Fog",
            "2100": "Fog",
            "3000": "Windy",
            "3001": "Windy",
            "3002": "Windy",
            "4000": "Drizzle",
            "4001": "Rain",
            "4200": "Rain",
            "4201": "Rain",
            "5000": "Snow",
            "5001": "Snow",
            "5100": "Snow",
            "5101": "Snow",
            "6000": "Drizzle",
            "6001": "Rain",
            "6200": "Sleet",
            "6201": "Sleet",
            "7000": "Sleet",
            "7101": "Sleet",
            "7102": "Sleet",
            "8000": "Thunderstorm"
        }
    }
}

// Exports...
export default Tomorrow.Instance
