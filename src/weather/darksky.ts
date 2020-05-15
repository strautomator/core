// Strautomator Core: Weather - Dark Sky

import {ActivityWeather, WeatherProvider, WeatherSummary} from "./types"
import {StravaActivity} from "../strava/types"
import {UserPreferences} from "../users/types"
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
     * @param preferences User preferences to correctly set weathre units.
     */
    getActivityWeather = async (activity: StravaActivity, preferences: UserPreferences): Promise<ActivityWeather> => {
        try {
            if (!activity.locationStart && !activity.locationEnd) {
                throw new Error(`Activity ${activity.id} has no location data`)
            }

            const weather: ActivityWeather = {provider: this.name}

            // Get defaults based on user preference.
            const units = preferences.weatherUnit == "f" ? "us" : "si"
            const lang = preferences.language || "en"

            // Helper to get the API URL.
            const getUrl = (location: number[], date: Date) => {
                const timestamp = moment(date).unix()
                const endpoint = `${location[0]},${location[1]},${timestamp}?units=${units}&lang=${lang}`
                return `${settings.weather.darksky.baseUrl}${settings.weather.darksky.secret}/${endpoint}`
            }

            // Get weather report for start location.
            if (activity.dateStart && activity.locationStart) {
                try {
                    const startResult: any = await axios({url: getUrl(activity.locationStart, activity.dateStart)})
                    weather.start = this.toWeatherSummary(startResult.data, preferences)
                } catch (ex) {
                    logger.error("DarkSky.getActivityWeather", `Activity ${activity.id}, weather at start`, ex)
                }
            }

            // Get weather report for end location.
            if (activity.dateEnd && activity.locationEnd) {
                try {
                    const endResult: any = await axios({url: getUrl(activity.locationEnd, activity.dateEnd)})
                    weather.end = this.toWeatherSummary(endResult.data, preferences)
                } catch (ex) {
                    logger.error("DarkSky.getActivityWeather", `Activity ${activity.id}, weather at end`, ex)
                }
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
    private toWeatherSummary = (data: any, preferences: UserPreferences): WeatherSummary => {
        logger.debug("DarkSky.toWeatherSummary", data)

        const tempUnit = preferences.weatherUnit ? preferences.weatherUnit.toUpperCase() : "C"
        const windUnit = preferences.weatherUnit == "f" ? " mph" : " m/s"

        return {
            summary: data.currently.summary,
            iconText: data.currently.icon,
            temperature: data.currently.temperature.toFixed(0) + "°" + tempUnit,
            humidity: (data.currently.humidity * 100).toFixed(0) + "%",
            pressure: data.currently.pressure.toFixed(0) + " hPa",
            windSpeed: data.currently.windSpeed.toFixed(1) + windUnit,
            windBearing: data.currently.windBearing,
            precipType: data.currently.precipType || null
        }
    }
}

// Exports...
export default DarkSky.Instance
