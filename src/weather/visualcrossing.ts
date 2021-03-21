// Strautomator Core: Weather - Visual Crossing

import {WeatherApiStats, WeatherProvider, WeatherSummary} from "./types"
import {processWeatherSummary, weatherSummaryString} from "./utils"
import {UserPreferences} from "../users/types"
import {axiosRequest} from "../axios"
import logger = require("anyhow")
import moment = require("moment")
const settings = require("setmeup").settings

/**
 * Visual Crossing weather API.
 */
export class VisualCrossing implements WeatherProvider {
    private constructor() {}
    private static _instance: VisualCrossing
    static get Instance(): VisualCrossing {
        return this._instance || (this._instance = new this())
    }
    apiRequest = null
    stats: WeatherApiStats = null

    name: string = "visualcrossing"
    title: string = "Visual Crossing"
    maxHours: number = 1560

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

            const baseUrl = settings.weather.visualcrossing.baseUrl
            const secret = settings.weather.visualcrossing.secret
            const mDate = moment.utc(date)
            if (mDate.dayOfYear() != moment().utc().dayOfYear()) mDate.subtract(1, "days")

            const qDate = mDate.format("YYYY-MM-DDTHH:mm:ss")
            const latlon = coordinates.join(",")
            const include = "current,obs,histfcst"
            let weatherUrl = `${baseUrl}timeline/${latlon}/${qDate}?key=${secret}&include=${include}&unitGroup=metric`

            // Fetch weather data.
            logger.debug("VisualCrossing.getWeather", weatherUrl)
            const res = await this.apiRequest.schedule(() => axiosRequest({url: weatherUrl}))

            // Parse result.
            const result = this.toWeatherSummary(res, date, preferences)
            if (result) {
                logger.info("VisualCrossing.getWeather", weatherSummaryString(coordinates, date, result))
            }

            return result
        } catch (ex) {
            logger.error("VisualCrossing.getWeather", coordinates, isoDate, unit, ex)
            throw ex
        }
    }

    /**
     * Transform data from the Visual Crossing API to a WeatherSummary.
     * @param data Data from Visual Crossing.
     */
    private toWeatherSummary = (data: any, date: Date, preferences: UserPreferences): WeatherSummary => {
        logger.debug("VisualCrossing.toWeatherSummary", data, date, preferences.weatherUnit)

        // Locate correct hour report from the response.
        if (data.days && data.days.length > 0) {
            data = data.days[0]
            if (data.hours && data.hours.length > 0) {
                data = data.hours.find((d) => d.datetime == moment.utc(date).format("HH:mm:ss"))
            }
        }

        // Data not found? Stop here.
        if (!data || !data.datetime) return

        // Get precipitation details.
        const precipLevel = data.precip || 0
        const snowDepth = data.snow || 0
        let precipitation = data.preciptype
        if (!precipitation) precipitation = snowDepth > 0 ? "snow" : null
        else if (precipitation == "freezingrain") precipitation = "freezing rain"

        const result: WeatherSummary = {
            summary: data.conditions,
            temperature: data.temp,
            feelsLike: data.feelslike,
            humidity: data.humidity,
            pressure: data.pressure,
            windSpeed: data.windspeed ? data.windspeed / 3.6 : null,
            windDirection: data.winddir,
            precipitation: precipitation,
            cloudCover: data.cloudcover,
            extraData: {
                mmPrecipitation: snowDepth || precipLevel,
                visibility: data.visibility
            }
        }

        // Process and return weather summary.
        processWeatherSummary(result, date, preferences)
        return result
    }
}

// Exports...
export default VisualCrossing.Instance
