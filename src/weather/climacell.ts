// Strautomator Core: Weather - ClimaCell

import {ActivityWeather, MoonPhase, WeatherProvider, WeatherSummary} from "./types"
import {StravaActivity} from "../strava/types"
import logger = require("anyhow")
import moment = require("moment")
const axios = require("axios").default
const settings = require("setmeup").settings

/**
 * ClimaCell weather API.
 */
export class ClimaCell implements WeatherProvider {
    private constructor() {}
    private static _instance: ClimaCell
    static get Instance(): ClimaCell {
        return this._instance || (this._instance = new this())
    }

    /** Weather provider name for ClimaCell. */
    name: string = "climacell"
    /** ClimaCell provider. */
    title: string = "ClimaCell"

    // INIT
    // --------------------------------------------------------------------------

    /**
     * Init the ClimaCell wrapper.
     */
    init = async (): Promise<void> => {
        try {
            if (!settings.weather.climacell.secret) {
                throw new Error("Missing the mandatory weather.climacell.secret setting")
            }
        } catch (ex) {
            logger.error("ClimaCell.init", ex)
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
                const startTime = moment(date).toISOString()
                const endTime = moment(date).add(30, "m").toISOString()
                return `lat=${location[0]}&lon=${location[0]}&start_time=${startTime}&end_time=${endTime}`
            }

            const fields = "temp,humidity,wind_speed,wind_direction,baro_pressure,precipitation,precipitation_type,cloud_cover,weather_code"
            const baseQuery = `timestep=10&unit_system=si&fields=${fields}&apikey=${settings.weather.climacell.secret}&`
            const baseUrl = `${settings.weather.climacell.baseUrl}historical/climacell?${baseQuery}`

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
            logger.error("ClimaCell.getActivityWeather", `Activity ${activity.id}`, ex)
            throw ex
        }
    }

    /**
     * Transform data from the ClimaCell API to a WeatherSummary.
     * @param data Data from ClimaCell.
     */
    private toWeatherSummary = (data): WeatherSummary => {
        const precipType = data.precipitation_type ? data.precipitation_type.value : ""

        return {
            summary: data.summary,
            iconText: data.weather_code.value,
            temperature: data.temp.value.toFixed(0) + "°" + data.temp.units,
            humidity: data.humidity.value.toFixed(0) + data.humidity.units,
            pressure: data.baro_pressure.value.toFixed(0) + data.baro_pressure.units,
            windSpeed: data.wind_speed.value.toFixed(1) + data.wind_speed.units,
            windBearing: data.wind_direction.value,
            precipType: precipType
        }
    }
}

// Exports...
export default ClimaCell.Instance
