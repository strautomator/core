// Strautomator Core: Weather - Weatherbit

import {ActivityWeather, WeatherProvider, WeatherSummary} from "./types"
import {StravaActivity} from "../strava/types"
import logger = require("anyhow")
import moment = require("moment")
const axios = require("axios").default
const settings = require("setmeup").settings

/**
 * Weatherbit weather API.
 */
export class Weatherbit implements WeatherProvider {
    private constructor() {}
    private static _instance: Weatherbit
    static get Instance(): Weatherbit {
        return this._instance || (this._instance = new this())
    }

    /** Weather provider name for Weatherbit. */
    name: string = "weatherbit"
    /** Weatherbit provider. */
    title: string = "Weatherbit"

    // INIT
    // --------------------------------------------------------------------------

    /**
     * Init the Weatherbit wrapper.
     */
    init = async (): Promise<void> => {
        try {
            if (!settings.weather.weatherbit.secret) {
                throw new Error("Missing the mandatory weather.weatherbit.secret setting")
            }
        } catch (ex) {
            logger.error("Weatherbit.init", ex)
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
            const getLatLongTime = (location: number[], date: Date, plus: boolean) => {
                let start: any = moment(date)
                let end: any = moment(date)

                if (plus) {
                    end.add(1, "h")
                } else {
                    start.subtract(1, "h")
                }

                start = start.format("YYYY-MM-DD:HH")
                end = end.format("YYYY-MM-DD:HH")

                return `&lat=${location[0]}&lon=${location[0]}&start_date=${start}&end_date=${end}&tz=local`
            }

            const baseUrl = `${settings.weather.weatherbit.baseUrl}?key=${settings.weather.weatherbit.secret}`

            // Get weather report for start location.
            const queryStart = getLatLongTime(activity.locationStart, activity.dateStart, true)
            const startResult: any = await axios({url: baseUrl + queryStart})
            const weather: ActivityWeather = {
                start: this.toWeatherSummary(startResult.data)
            }

            // Get weather report for end location.
            if (!onlyStart && activity.dateEnd) {
                const queryEnd = getLatLongTime(activity.locationEnd, activity.dateEnd, false)
                const endResult: any = await axios({url: baseUrl + queryEnd})
                weather.end = this.toWeatherSummary(endResult.data)
            }

            return weather
        } catch (ex) {
            logger.error("Weatherbit.getActivityWeather", `Activity ${activity.id}`, ex)
            throw ex
        }
    }

    /**
     * Transform data from the Weatherbit API to a WeatherSummary.
     * @param data Data from Weatherbit.
     */
    private toWeatherSummary = (data): WeatherSummary => {
        data = data.data[0]

        const code = data.weather.code.substring(1)
        let iconText: string

        switch (code) {
            case "2":
                iconText = "thunderstorm"
                break
            case "3":
            case "5":
                iconText = "rain"
                break
            case "6":
                iconText = ["610", "611"].indexOf(data.weather.code) < 0 ? "snow" : "sleet"
                break
            case "7":
                iconText = "fog"
                break
            case "8":
                iconText = ["800", "801"].indexOf(data.weather.code) < 0 ? "cloudy" : "clear-day"
                break
            case "9":
                iconText = "rain"
                break
            default:
                iconText = "cloudy"
        }

        // Get correct precipitation type.
        let precipType: string = null
        if (data.snow) {
            precipType = "snow"
        } else if (data.rain) {
            precipType = "rain"
        }

        return {
            provider: this.name,
            summary: data.weather.description,
            iconText: iconText,
            temperature: data.temp.toFixed(0) + "°C",
            humidity: data.rh.toFixed(0) + "%",
            pressure: data.pres.toFixed(0) + "hPa",
            windSpeed: data.wind_spd.toFixed(1) + "m/s",
            windBearing: data.wind_dir,
            precipType: precipType
        }
    }
}

// Exports...
export default Weatherbit.Instance
