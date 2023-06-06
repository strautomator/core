// Strautomator Core: Weather - Tomorrow.io

import {WeatherApiStats, WeatherProvider, WeatherRoundTo, WeatherSummary} from "./types"
import {getSuntimes} from "./utils"
import {UserData} from "../users/types"
import {axiosRequest} from "../axios"
import {AxiosResponse} from "axios"
import logger = require("anyhow")
import * as logHelper from "../loghelper"
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
    hoursFuture: number = 160
    aqiEnabled?: boolean = true

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
        const unit = user.preferences?.weatherUnit == "f" ? "imperial" : "metric"
        const isoDate = dDate.toISOString()
        const utcDate = dDate.utc()
        const utcNow = dayjs.utc()
        const diffHours = Math.abs(utcNow.diff(utcDate, "hours"))
        const isFuture = utcNow.isBefore(utcDate)
        const maxHours = isFuture ? this.hoursFuture : this.hoursPast

        try {
            if (diffHours > maxHours) throw new Error(`Date out of range: ${isoDate}`)

            const baseUrl = settings.weather.tomorrow.baseUrl
            const secret = settings.weather.tomorrow.secret
            const dateFormat = "YYYY-MM-DDTHH:mm:ss"
            const startTime = utcDate.subtract(settings.weather.dateSubtractMinutes, "minutes").format(dateFormat) + "Z"
            const endTime = utcDate.add(settings.weather.dateAddMinutes, "minutes").format(dateFormat) + "Z"
            const fields = "weatherCode,temperature,humidity,windSpeed,windDirection,pressureSurfaceLevel,precipitationType,cloudCover,visibility,epaIndex"
            const latlon = coordinates.join(",")
            const weatherUrl = `${baseUrl}timelines?&location=${latlon}&timesteps=1h&startTime=${startTime}&endTime=${endTime}&fields=${fields}&apikey=${secret}`

            // Fetch weather data.
            logger.debug("Tomorrow.getWeather", weatherUrl)
            const res = await this.apiRequest.schedule(() => axiosRequest({url: weatherUrl}, this.rateLimitExtractor))

            // Parse result.
            const result = this.toWeatherSummary(res, coordinates, dDate, roundTo)
            return result
        } catch (ex) {
            logger.error("Tomorrow.getWeather", logHelper.user(user), coordinates, isoDate, unit, ex)
            this.stats.errorCount++
            throw ex
        }
    }

    /**
     * Transform data from the Tomorrow API to a WeatherSummary.
     * @param rawData Raw data from Tomorrow.
     * @param coordinates Array with latitude and longitude.
     * @param dDate The date (as a DayJS object).
     * @param roundTo Round to the previous or next hour?
     */
    private toWeatherSummary = (rawData: any, coordinates: [number, number], dDate: dayjs.Dayjs, roundTo?: WeatherRoundTo): WeatherSummary => {
        if (!rawData?.data?.timelines) return null
        let data = rawData.data.timelines[0]

        const index = dDate.utc().minute() > 30 && roundTo == WeatherRoundTo.NextHour && data.intervals.length > 1 ? 1 : 0
        data = data.intervals[index].values

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

        // Has precipitation?
        if (precipitation) {
            result.precipitation = precipitation
        }

        // Get correct AQI index.
        if (data.epaIndex) {
            if (data.epaIndex > 300) result.aqi = 5
            else if (data.epaIndex > 200) result.aqi = 4
            else if (data.epaIndex > 150) result.aqi = 3
            else if (data.epaIndex > 100) result.aqi = 2
            else if (data.epaIndex > 50) result.aqi = 1
            else result.aqi = 0
        }

        return result
    }

    /**
     * Helper to extract rate limits from response headers.
     * @param res The Axios response.
     */
    private rateLimitExtractor = (res: AxiosResponse): number => {
        let currentUsage = 0

        try {
            for (let key of ["hour", "day"]) {
                const headerLimit = parseInt(res.headers[`x-ratelimit-limit-${key}`] || "1")
                const headerRemaining = parseInt(res.headers[`x-ratelimit-remaining-${key}`] || "1")
                const usage = ((headerLimit - headerRemaining) / headerLimit) * 100
                if (usage > currentUsage) {
                    currentUsage = usage
                }
            }
        } catch (ex) {
            logger.warn("Tomorrow.rateLimitExtractor", ex)
        }

        return currentUsage
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
