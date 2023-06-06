// Strautomator Core: Weather - Storm Glass

import {WeatherApiStats, WeatherProvider, WeatherRoundTo, WeatherSummary} from "./types"
import {getSuntimes} from "./utils"
import {UserData} from "../users/types"
import {axiosRequest} from "../axios"
import logger = require("anyhow")
import * as logHelper from "../loghelper"
import dayjs from "../dayjs"
const settings = require("setmeup").settings

/**
 * Storm Glass weather API.
 */
export class StormGlass implements WeatherProvider {
    private constructor() {}
    private static _instance: StormGlass
    static get Instance(): StormGlass {
        return this._instance || (this._instance = new this())
    }
    apiRequest = null
    stats: WeatherApiStats = null

    name: string = "stormglass"
    title: string = "Storm Glass"
    hoursPast: number = 160
    hoursFuture: number = 0

    // METHODS
    // --------------------------------------------------------------------------

    /**
     * Get current weather conditions for the specified coordinates and date.
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

            const baseUrl = settings.weather.stormglass.baseUrl
            const secret = settings.weather.stormglass.secret
            const isYesterday = utcDate.dayOfYear() != dayjs.utc().dayOfYear()
            const params = "airTemperature,humidity,pressure,cloudCover,windDirection,windSpeed,precipitation,snowDepth,visibility"
            let weatherUrl = `${baseUrl}weather/point?lat=${coordinates[0]}&lng=${coordinates[1]}&params=${params}`

            // If date is different than today, send it with the request.
            if (isYesterday) {
                const startTime = utcDate.subtract(settings.weather.dateSubtractMinutes, "minutes").unix()
                const endTime = utcDate.add(settings.weather.dateAddMinutes, "minutes").unix()
                weatherUrl += `&start=${startTime}&end=${endTime}`
            }

            // Set auth header.
            const headers = {Authorization: secret}

            // Fetch weather data.
            logger.debug("StormGlass.getWeather", weatherUrl)
            const res = await this.apiRequest.schedule(() => axiosRequest({url: weatherUrl, headers: headers}))

            // Parse result.
            const result = this.toWeatherSummary(res, coordinates, dDate, roundTo)
            return result
        } catch (ex) {
            logger.error("StormGlass.getWeather", logHelper.user(user), coordinates, isoDate, unit, ex)
            this.stats.errorCount++
            throw ex
        }
    }

    /**
     * Transform data from the Storm Glass API to a WeatherSummary.
     * @param rawData Raw data from Storm Glass.
     * @param coordinates Array with latitude and longitude.
     * @param dDate The date (as a DayJS object).
     * @param roundTo Round to the previous or next hour?
     */
    private toWeatherSummary = (rawData: any, coordinates: [number, number], dDate: dayjs.Dayjs, roundTo?: WeatherRoundTo): WeatherSummary => {
        if (!rawData) return null
        let data = rawData.hours || rawData.data

        // Locate weather details for the correct time.
        const bestDate = dDate.minute() > 30 && roundTo == WeatherRoundTo.NextHour ? dDate.utc().add(1, "hour") : dDate.utc()
        const dateFormat = "YYYY-MM-DDTHH"
        const timeFilter = bestDate.format(dateFormat)
        const timeFilterPrevious = dDate.subtract(1, "hour").format(dateFormat)
        const timeData = data.find((r) => r.time.includes(timeFilter) || r.time.includes(timeFilterPrevious))

        // Data for the specified time not found? Stop here.
        if (!timeData) return null

        const cloudCover = this.getDataProperty(timeData.cloudCover)
        const precipLevel = this.getDataProperty(timeData.precipitation)
        const snowDepth = this.getDataProperty(timeData.snowDepth)
        const precipitation = snowDepth > 0 && precipLevel > 0 ? "Snow" : null

        const result: WeatherSummary = {
            provider: this.name,
            summary: null,
            temperature: this.getDataProperty(timeData.airTemperature),
            feelsLike: this.getDataProperty(timeData.airTemperature),
            humidity: this.getDataProperty(timeData.humidity),
            pressure: this.getDataProperty(timeData.pressure),
            windSpeed: this.getDataProperty(timeData.windSpeed),
            windDirection: this.getDataProperty(timeData.windDirection),
            precipitation: precipitation,
            cloudCover: cloudCover,
            visibility: this.getDataProperty(timeData.visibility),
            extraData: {
                timeOfDay: getSuntimes(coordinates, dDate).timeOfDay,
                mmPrecipitation: precipLevel
            }
        }

        return result
    }

    /**
     * Helper to get a property value from SG, DWD or NOAA sources.
     * @param data Data to get the property from.
     */
    private getDataProperty = (data: any) => {
        if (!data) return null
        return data.sg || data.dwd || data.noaa
    }
}

// Exports...
export default StormGlass.Instance
