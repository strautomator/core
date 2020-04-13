"use strict";
// Strautomator Core: Weather - OpenWeatherMap
Object.defineProperty(exports, "__esModule", { value: true });
const logger = require("anyhow");
const axios = require("axios").default;
const settings = require("setmeup").settings;
/**
 * OpenWeatherMap weather API.
 */
class OpenWeatherMap {
    constructor() {
        /** Weather provider name for OpenWeatherMap. */
        this.name = "openweathermap";
        // INIT
        // --------------------------------------------------------------------------
        /**
         * Init the OpenWeatherMap wrapper.
         */
        this.init = async () => {
            try {
                if (!settings.weather.openweathermap.secret) {
                    throw new Error("Missing the mandatory weather.openweathermap.secret setting");
                }
            }
            catch (ex) {
                logger.error("OpenWeatherMap.init", ex);
            }
        };
        // METHODS
        // --------------------------------------------------------------------------
        /**
         * Return the weather for the specified activity. Only works for the current weather.
         * @param activity The Strava activity.
         */
        this.getActivityWeather = async (activity) => {
            try {
                const baseUrl = `${settings.weather.openweathermap.baseUrl}?appid=${settings.weather.openweathermap.secret}`;
                const location = activity.locationEnd || activity.locationStart;
                const query = `&units=metric&lat=${location[0]}&lon=${location[0]}`;
                // Get current weather report.
                const result = await axios({ url: baseUrl + query });
                const weather = {
                    start: this.toWeatherSummary(result.data)
                };
                return weather;
            }
            catch (ex) {
                logger.error("OpenWeatherMap.getActivityWeather", `Activity ${activity.id}`, ex);
                throw ex;
            }
        };
        /**
         * Transform data from the OpenWeatherMap API to a WeatherSummary.
         * @param data Data from OpenWeatherMap.
         */
        this.toWeatherSummary = (data) => {
            const code = data.weather[0].icon.substring(1);
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
                summary: data.weather[0].description,
                iconText: iconText,
                temperature: data.main.temp.toFixed(0) + "°C",
                humidity: data.main.humidity.toFixed(0) + "%",
                pressure: data.main.pressure.toFixed(0) + "hPa",
                windSpeed: data.wind.speed.toFixed(1) + "m/s",
                windBearing: data.wind.deg,
                precipType: precipType
            };
        };
    }
    static get Instance() {
        return this._instance || (this._instance = new this());
    }
}
exports.OpenWeatherMap = OpenWeatherMap;
// Exports...
exports.default = OpenWeatherMap.Instance;
