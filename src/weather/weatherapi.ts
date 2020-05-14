// Strautomator Core: WeatherAPI.com (NOT WORKING YET)

import {ActivityWeather, WeatherProvider, WeatherSummary} from "./types"
import {StravaActivity} from "../strava/types"
import _ = require("lodash")
import logger = require("anyhow")
import moment = require("moment")
const axios = require("axios").default
const settings = require("setmeup").settings

/**
 * WeatherAPI.com weather API.
 */
export class WeatherAPI implements WeatherProvider {
    private constructor() {}
    private static _instance: WeatherAPI
    static get Instance(): WeatherAPI {
        return this._instance || (this._instance = new this())
    }

    /** Weather provider name for WeatherAPI. */
    name: string = "weatherapi"
    /** WeatherAPI provider. */
    title: string = "WeatherAPI.com"

    // INIT
    // --------------------------------------------------------------------------

    /**
     * Init the WeatherAPI.com wrapper.
     */
    init = async (): Promise<void> => {
        try {
            if (!settings.weather.weatherapi.secret) {
                throw new Error("Missing the mandatory weather.weatherapi.secret setting")
            }
        } catch (ex) {
            logger.error("WeatherAPI.init", ex)
        }
    }

    // METHODS
    // --------------------------------------------------------------------------

    /**
     * Return the weather for the specified activity.
     * @param activity The Strava activity.
     * @param onlyStart If true, will NOT get weather for the end location.
     */
    getActivityWeather = async (activity: StravaActivity, onlyStart?: boolean): Promise<ActivityWeather> => {
        try {
            const getLatLongTime = (location: number[], date: Date) => {
                const startTime = moment(date).unix() - 120
                const endTime = startTime + 7200
                return `q=${location[0]},${location[1]}&unixdt=${startTime}&unixend_dt=${endTime}`
            }

            const baseUrl = `${settings.weather.weatherapi.baseUrl}?key=${settings.weather.weatherapi.secret}&`

            // Get weather report for start location.
            const queryStart = getLatLongTime(activity.locationStart, activity.dateStart)
            const startResult: any = await axios({url: baseUrl + queryStart})
            const startData = this.filterData(startResult.data, activity.dateStart)
            const weather: ActivityWeather = {
                start: this.toWeatherSummary(startData, activity.dateStart)
            }

            // Get weather report for end location.
            if (!onlyStart && activity.dateEnd) {
                const queryEnd = getLatLongTime(activity.locationEnd, activity.dateEnd)
                const endResult: any = await axios({url: baseUrl + queryEnd})
                const endData = this.filterData(endResult.data, activity.dateStart)
                weather.end = this.toWeatherSummary(endData, activity.dateEnd)
            }

            return weather
        } catch (ex) {
            logger.error("WeatherAPI.getActivityWeather", `Activity ${activity.id}`, ex)
            throw ex
        }
    }

    /**
     * Transform data from the WeatherAPI API to a WeatherSummary.
     * @param data Data from WeatherAPI.
     */
    private toWeatherSummary = (data: any, date: Date): WeatherSummary => {
        const hour = date.getHours()
        const isDaylight = hour > 6 && hour < 19
        const cloudCover = data.cloud

        let precipType = null
        let iconText

        if (data.precip_mm > 0) {
            if (data.temp_c < 0) precipType = "snow"
            else if (data.temp_c < 3) precipType = "sleet"
            else precipType = "rain"
        }

        if (cloudCover < 10) {
            iconText = isDaylight ? "clear-day" : "clear-night"
        } else if (cloudCover < 50) {
            iconText = isDaylight ? "partly-cloudy-day" : "partly-cloudy-night"
        } else if (precipType) {
            iconText = precipType
        } else {
            iconText = "cloudy"
        }

        return {
            provider: this.name,
            summary: data.condition.text,
            iconText: iconText,
            temperature: data.temp_c.toFixed(0) + "°C",
            humidity: data.humidity.toFixed(0) + "%",
            pressure: data.pressure_mb + "hPa",
            windSpeed: data.wind_kph.toFixed(1) + "kph",
            windBearing: data.wind_degree,
            precipType: precipType
        }
    }

    /**
     * Filter the response data from WeatherAPI and get details relevant to the specific date time.
     */
    private filterData = (data: any, date: Date) => {
        if (!data || !data.forecast.forecastday) {
            return null
        }

        const mDate = moment(date)

        // Try finding the particular day.
        const dayData = _.find(data.forecast.forecastday, {date: mDate.format("YYYY-MM-DD")})
        if (!dayData) {
            throw new Error(`No data found for day ${mDate.format("YYYY-MM-DD")}`)
        }

        // Try finding the particular hour.
        const hourData = _.find(dayData.hour, {date: moment(date).format("YYYY-MM-DD HH:00")})
        if (!hourData) {
            throw new Error(`No data found for hour ${mDate.format("HH:00")}`)
        }

        return hourData
    }
}

// Exports...
export default WeatherAPI.Instance
