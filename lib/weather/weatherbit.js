"use strict";
// Strautomator Core: Weather - Weatherbit
Object.defineProperty(exports, "__esModule", { value: true });
const logger = require("anyhow");
const moment = require("moment");
const axios = require("axios").default;
const settings = require("setmeup").settings;
/**
 * Weatherbit weather API.
 */
class Weatherbit {
    constructor() {
        /** Weather provider name for Weatherbit. */
        this.name = "weatherbit";
        // INIT
        // --------------------------------------------------------------------------
        /**
         * Init the Weatherbit wrapper.
         */
        this.init = async () => {
            try {
                if (!settings.weather.weatherbit.secret) {
                    throw new Error("Missing the mandatory weather.weatherbit.secret setting");
                }
            }
            catch (ex) {
                logger.error("Weatherbit.init", ex);
            }
        };
        // METHODS
        // --------------------------------------------------------------------------
        /**
         * Return the weather for the specified activity.
         * @param activity The Strava activity.
         * @param onlyStart If true, will NOT get weather for the end location.
         */
        this.getActivityWeather = async (activity, onlyStart) => {
            try {
                const getLatLongTime = (location, date, plus) => {
                    let start = moment(date);
                    let end = moment(date);
                    if (plus) {
                        end.add(1, "h");
                    }
                    else {
                        start.subtract(1, "h");
                    }
                    start = start.format("YYYY-MM-DD:HH");
                    end = end.format("YYYY-MM-DD:HH");
                    return `&lat=${location[0]}&lon=${location[0]}&start_date=${start}&end_date=${end}&tz=local`;
                };
                const baseUrl = `${settings.weather.weatherbit.baseUrl}?key=${settings.weather.weatherbit.secret}`;
                // Get weather report for start location.
                const queryStart = getLatLongTime(activity.locationStart, activity.dateStart, true);
                const startResult = await axios({ url: baseUrl + queryStart });
                const weather = {
                    start: this.toWeatherSummary(startResult.data)
                };
                // Get weather report for end location.
                if (!onlyStart) {
                    const queryEnd = getLatLongTime(activity.locationEnd, activity.dateEnd, false);
                    const endResult = await axios({ url: baseUrl + queryEnd });
                    weather.end = this.toWeatherSummary(endResult.data);
                }
                return weather;
            }
            catch (ex) {
                logger.error("Weatherbit.getActivityWeather", `Activity ${activity.id}`, ex);
                throw ex;
            }
        };
        /**
         * Transform data from the Weatherbit API to a WeatherSummary.
         * @param data Data from Weatherbit.
         */
        this.toWeatherSummary = (data) => {
            data = data.data[0];
            const code = data.weather.code.substring(1);
            let iconText;
            switch (code) {
                case "2":
                    iconText = "thunderstorm";
                    break;
                case "3":
                case "5":
                    iconText = "rain";
                    break;
                case "6":
                    iconText = ["610", "611"].indexOf(data.weather.code) < 0 ? "snow" : "sleet";
                    break;
                case "7":
                    iconText = "fog";
                    break;
                case "8":
                    iconText = ["800", "801"].indexOf(data.weather.code) < 0 ? "cloudy" : "clear-day";
                    break;
                case "9":
                    iconText = "rain";
                    break;
                default:
                    iconText = "cloudy";
            }
            // Get correct precipitation type.
            let precipType = null;
            if (data.snow) {
                precipType = "snow";
            }
            else if (data.rain) {
                precipType = "rain";
            }
            return {
                summary: data.weather.description,
                iconText: iconText,
                temperature: data.temp.toFixed(0) + "°C",
                humidity: data.rh.toFixed(0) + "%",
                pressure: data.pres.toFixed(0) + "hPa",
                windSpeed: data.wind_spd.toFixed(1) + "m/s",
                windBearing: data.wind_dir,
                precipType: precipType
            };
        };
    }
    static get Instance() {
        return this._instance || (this._instance = new this());
    }
}
exports.Weatherbit = Weatherbit;
// Exports...
exports.default = Weatherbit.Instance;
