// Strautomator Core: Weather - Storm Glass

import {WeatherApiStats, WeatherProvider, WeatherSummary} from "./types"
import {processWeatherSummary, weatherSummaryString} from "./utils"
import {UserPreferences} from "../users/types"
import {axiosRequest} from "../axios"
import logger = require("anyhow")
import moment = require("moment")
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
    maxHours: number = 168

    // METHODS
    // --------------------------------------------------------------------------

    /**
     * Get current weather conditions for the specified coordinates and date.
     * @param coordinates Array with latitude and longitude.
     * @param date Date for the weather request.
     * @param preferences User preferences to get proper weather units.
     */
    getWeather = async (coordinates: [number, number], date: Date, preferences: UserPreferences): Promise<WeatherSummary> => {
        const unit = preferences && preferences.weatherUnit == "f" ? "imperial" : "metric"
        const isoDate = date.toISOString()

        try {
            if (!preferences) preferences = {}
            if (moment.utc().diff(date, "hours") > this.maxHours) throw new Error(`Date out of range: ${isoDate}`)

            const baseUrl = settings.weather.stormglass.baseUrl
            const secret = settings.weather.stormglass.secret
            const mDate = moment.utc(date)
            const isYesterday = mDate.dayOfYear() != moment.utc().dayOfYear()
            const params = "airTemperature,humidity,pressure,cloudCover,windDirection,windSpeed,precipitation,snowDepth"
            let weatherUrl = `${baseUrl}weather/point?lat=${coordinates[0]}&lng=${coordinates[1]}&params=${params}`

            // If date is different than today, send it with the request.
            if (isYesterday) weatherUrl += `&start=${mDate.unix()}&end=${mDate.add(1, "h").unix()}`

            // Set auth header.
            const headers = {Authorization: secret}

            // Fetch weather data.
            logger.debug("StormGlass.getWeather", weatherUrl)
            const res = await this.apiRequest.schedule(() => axiosRequest({url: weatherUrl, headers: headers}))

            // Parse result.
            const result = this.toWeatherSummary(res, date, preferences)
            if (result) {
                logger.info("StormGlass.getWeather", weatherSummaryString(coordinates, date, result))
            }

            return result
        } catch (ex) {
            logger.error("StormGlass.getWeather", coordinates, isoDate, unit, ex)
            this.stats.errorCount++
            throw ex
        }
    }

    /**
     * Transform data from the Storm Glass API to a WeatherSummary.
     * @param data Data from Storm Glass.
     */
    private toWeatherSummary = (data: any, date: Date, preferences: UserPreferences): WeatherSummary => {
        logger.debug("StormGlass.toWeatherSummary", data, date, preferences.weatherUnit)

        // Get correct array from response.
        data = data.hours || data.data

        // Locate weather details for the correct time.
        const timeFilter = moment.utc(date).format("YYYY-MM-DDTHH")
        const timeData = data.find((r) => r.time.indexOf(timeFilter) >= 0)

        // Data for the specified time not found? Stop here.
        if (!timeData) return

        const cloudCover = this.getDataProperty(timeData.cloudCover)
        const precipLevel = this.getDataProperty(timeData.precipitation)
        const snowDepth = this.getDataProperty(timeData.snowDepth)
        const precipitation = snowDepth > 0 && precipLevel > 0 ? "snow" : null

        const result: WeatherSummary = {
            summary: null,
            temperature: this.getDataProperty(timeData.airTemperature),
            feelsLike: this.getDataProperty(timeData.airTemperature),
            humidity: this.getDataProperty(timeData.humidity),
            pressure: this.getDataProperty(timeData.pressure),
            windSpeed: this.getDataProperty(timeData.windSpeed),
            windDirection: this.getDataProperty(timeData.windDirection),
            precipitation: precipitation,
            cloudCover: cloudCover,
            extraData: {
                mmPrecipitation: precipLevel,
                visibility: timeData.visibility
            }
        }

        // Process and return weather summary.
        processWeatherSummary(result, date, preferences)
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
