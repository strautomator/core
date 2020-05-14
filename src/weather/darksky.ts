// Strautomator Core: Weather - Dark Sky

import {ActivityWeather, WeatherProvider, WeatherSummary} from "./types"
import {StravaActivity} from "../strava/types"
import logger = require("anyhow")
import moment = require("moment")
const axios = require("axios").default
const settings = require("setmeup").settings

/**
 * DarkSky weather API.
 */
export class DarkSky implements WeatherProvider {
    private constructor() {}
    private static _instance: DarkSky
    static get Instance(): DarkSky {
        return this._instance || (this._instance = new this())
    }

    /** Weather provider name for Dark Sky. */
    name: string = "darksky"
    /** Dark Sky provider. */
    title: string = "Dark Sky"

    // INIT
    // --------------------------------------------------------------------------

    /**
     * Init the Dark Sky wrapper.
     */
    init = async (): Promise<void> => {
        try {
            if (!settings.weather.darksky.secret) {
                throw new Error("Missing the mandatory weather.darksky.secret setting")
            }
        } catch (ex) {
            logger.error("DarkSky.init", ex)
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
                let timestamp = moment(date).unix()
                return `${location[0]},${location[0]},${timestamp}?units=si`
            }

            const baseUrl = `${settings.weather.darksky.baseUrl}${settings.weather.darksky.secret}/`

            // Get weather report for start location.
            const queryStart = getLatLongTime(activity.locationStart, activity.dateStart)
            const startResult: any = await axios({url: baseUrl + queryStart})
            const weather: ActivityWeather = {
                start: this.toWeatherSummary(startResult.data)
            }

            // Get weather report for end location.
            if (!onlyStart && activity.dateEnd) {
                const queryEnd = getLatLongTime(activity.locationEnd, activity.dateEnd)
                const endResult: any = await axios({url: baseUrl + queryEnd})
                weather.end = this.toWeatherSummary(endResult.data)
            }

            return weather
        } catch (ex) {
            logger.error("DarkSky.getActivityWeather", `Activity ${activity.id}`, ex)
            throw ex
        }
    }

    /**
     * Transform data from the Dark Sky API to a WeatherSummary.
     * @param data Data from Dark Sky.
     */
    private toWeatherSummary = (data): WeatherSummary => {
        return {
            provider: this.name,
            summary: data.currently.summary,
            iconText: data.currently.icon,
            temperature: data.currently.temperature.toFixed(0) + "°C",
            humidity: (data.currently.humidity * 100).toFixed(0) + "%",
            pressure: data.currently.pressure.toFixed(0) + "hPa",
            windSpeed: data.currently.windSpeed.toFixed(1) + "m/s",
            windBearing: data.currently.windBearing,
            precipType: data.currently.precipType
        }
    }
}

// Exports...
export default DarkSky.Instance
