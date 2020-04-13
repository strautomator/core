"use strict";
// Strautomator Core: Weather - Dark Sky
Object.defineProperty(exports, "__esModule", { value: true });
const types_1 = require("./types");
const logger = require("anyhow");
const moment = require("moment");
const axios = require("axios").default;
const settings = require("setmeup").settings;
/**
 * DarkSky weather API.
 */
class DarkSky {
    constructor() {
        /** Weather provider name for Dark Sky. */
        this.name = "darksky";
        // INIT
        // --------------------------------------------------------------------------
        /**
         * Init the Dark Sky wrapper.
         */
        this.init = async () => {
            try {
                if (!settings.weather.darksky.secret) {
                    throw new Error("Missing the mandatory weather.darksky.secret setting");
                }
            }
            catch (ex) {
                logger.error("DarkSky.init", ex);
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
                const getLatLongTime = (location, date) => {
                    let timestamp = moment(date).unix();
                    return `${location[0]},${location[0]},${timestamp}?units=si`;
                };
                const baseUrl = `${settings.weather.darksky.baseUrl}${settings.weather.darksky.secret}/`;
                // Get weather report for start location.
                const queryStart = getLatLongTime(activity.locationStart, activity.dateStart);
                const startResult = await axios({ url: baseUrl + queryStart });
                const weather = {
                    start: this.toWeatherSummary(startResult.data)
                };
                // Get weather report for end location.
                if (!onlyStart) {
                    const queryEnd = getLatLongTime(activity.locationEnd, activity.dateEnd);
                    const endResult = await axios({ url: baseUrl + queryEnd });
                    weather.end = this.toWeatherSummary(endResult.data);
                }
                return weather;
            }
            catch (ex) {
                logger.error("DarkSky.getActivityWeather", `Activity ${activity.id}`, ex);
                throw ex;
            }
        };
        /**
         * Transform data from the Dark Sky API to a WeatherSummary.
         * @param data Data from Dark Sky.
         */
        this.toWeatherSummary = (data) => {
            let moon;
            if (data.currently.moonPhase > 0.4 && data.currently.moonPhase < 0.6) {
                moon = types_1.MoonPhase.Full;
            }
            else if (data.currently.moonPhase < 0.1 || data.currently.moonPhase > 0.9) {
                moon = types_1.MoonPhase.New;
            }
            else {
                moon = types_1.MoonPhase.Quarter;
            }
            return {
                summary: data.currently.summary,
                iconText: data.currently.icon,
                temperature: data.currently.temperature.toFixed(0) + "°C",
                humidity: (data.currently.humidity * 100).toFixed(0) + "%",
                pressure: data.currently.pressure.toFixed(0) + "hPa",
                windSpeed: data.currently.windSpeed.toFixed(1) + "m/s",
                windBearing: data.currently.windBearing,
                precipType: data.currently.precipType,
                moon: moon
            };
        };
    }
    static get Instance() {
        return this._instance || (this._instance = new this());
    }
}
exports.DarkSky = DarkSky;
// Exports...
exports.default = DarkSky.Instance;
