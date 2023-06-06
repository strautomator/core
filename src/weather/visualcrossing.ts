// Strautomator Core: Weather - Visual Crossing

import {WeatherApiStats, WeatherProvider, WeatherSummary} from "./types"
import {getSuntimes} from "./utils"
import {UserData} from "../users/types"
import {axiosRequest} from "../axios"
import logger = require("anyhow")
import * as logHelper from "../loghelper"
import dayjs from "../dayjs"
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
    hoursPast: number = 8760
    hoursFuture: number = 24

    // METHODS
    // --------------------------------------------------------------------------

    /**
     * Get current weather conditions for the specified coordinates and date.
     * Dates are handled in the local timezone according to the coordinates.
     * @param user User requesting the data.
     * @param coordinates Array with latitude and longitude.
     * @param dDate Date for the weather request (as a DayJS object).
     */
    getWeather = async (user: UserData, coordinates: [number, number], dDate: dayjs.Dayjs): Promise<WeatherSummary> => {
        const unit = user.preferences?.weatherUnit == "f" ? "imperial" : "metric"
        const isoDate = dDate.toISOString()
        const utcDate = dDate.utc()
        const utcNow = dayjs.utc()
        const diffHours = Math.abs(utcNow.diff(utcDate, "hours"))
        const isFuture = utcNow.isBefore(utcDate)
        const maxHours = isFuture ? this.hoursFuture : this.hoursPast

        try {
            if (diffHours > maxHours) throw new Error(`Date out of range: ${isoDate}`)

            const baseUrl = settings.weather.visualcrossing.baseUrl
            const secret = settings.weather.visualcrossing.secret

            if (utcDate.dayOfYear() != utcNow.dayOfYear()) {
                dDate = dDate.subtract(1, "days")
            }

            // Visual Crossing expects the date in their local timezone.
            const qDate = dDate.format("YYYY-MM-DDTHH:mm:ss")
            const latlon = coordinates.join(",")
            const lang = user.preferences?.language && user.preferences.language != "pt" ? user.preferences.language : "en"
            const include = diffHours > 1 ? "current,days,hours,fcst,obs" : "current"
            const basePath = diffHours > 1 ? `timeline/${latlon}/${qDate}` : `timeline/${latlon}`
            let weatherUrl = `${baseUrl}${basePath}?key=${secret}&include=${include}&lang=${lang}&unitGroup=metric`

            // Fetch weather data.
            logger.debug("VisualCrossing.getWeather", weatherUrl)
            const res = await this.apiRequest.schedule(() => axiosRequest({url: weatherUrl}))

            // Parse result.
            const result = this.toWeatherSummary(res, coordinates, dDate)
            return result
        } catch (ex) {
            logger.error("VisualCrossing.getWeather", logHelper.user(user), coordinates, isoDate, unit, ex)
            throw ex
        }
    }

    /**
     * Transform data from the Visual Crossing API to a WeatherSummary.
     * @param rawData Raw data from Visual Crossing.
     * @param coordinates Array with latitude and longitude.
     * @param dDate The date (as a DayJS object).
     * @param preferences The user preferences.
     */
    private toWeatherSummary = (rawData: any, coordinates: [number, number], dDate: dayjs.Dayjs): WeatherSummary => {
        if (!rawData) return null
        let data = rawData

        // Locate correct report from the response.
        if (data.days?.length > 0) {
            data = data.days.find((d) => d.datetime == dDate.format("YYYY-MM-DD")) || data.days[0] || data
        }
        if (data.hours?.length > 0) {
            data = data.hours.find((d) => d.datetime == dDate.format("HH:mm:ss")) || data.hours[0] || data
        }
        if (!data.temp && !data.humidity && !data.icon) {
            data = data.currentConditions
        }

        // Data not found? Stop here.
        if (!data || (!data.temp && !data.humidity && !data.icon)) return null

        // Get precipitation details.
        const precipLevel = data.precip || 0
        const snowDepth = data.snow || 0
        let precipitation = data.preciptype
        if (!precipitation) precipitation = snowDepth > 0 ? "Snow" : null
        else if (precipitation == "freezingrain" || precipitation == "ice") precipitation = "Sleet"

        const result: WeatherSummary = {
            provider: this.name,
            summary: data.conditions,
            temperature: data.temp,
            feelsLike: data.feelslike,
            humidity: data.humidity,
            pressure: data.pressure,
            windSpeed: data.windspeed ? data.windspeed / 3.6 : null,
            windDirection: data.winddir,
            precipitation: precipitation,
            cloudCover: data.cloudcover,
            visibility: data.visibility,
            extraData: {
                timeOfDay: getSuntimes(coordinates, dDate).timeOfDay,
                mmPrecipitation: snowDepth || precipLevel
            }
        }

        // Incomplete data returned? Discard it.
        if (result.temperature == 0 && result.humidity === null && result.pressure === null && result.windSpeed === null) {
            return
        }

        return result
    }
}

// Exports...
export default VisualCrossing.Instance
