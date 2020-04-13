import { ActivityWeather, WeatherProvider } from "./types";
import { StravaActivity } from "../strava/types";
/**
 * OpenWeatherMap weather API.
 */
export declare class OpenWeatherMap implements WeatherProvider {
    private constructor();
    private static _instance;
    static get Instance(): OpenWeatherMap;
    /** Weather provider name for OpenWeatherMap. */
    name: string;
    /**
     * Init the OpenWeatherMap wrapper.
     */
    init: () => Promise<void>;
    /**
     * Return the weather for the specified activity. Only works for the current weather.
     * @param activity The Strava activity.
     */
    getActivityWeather: (activity: StravaActivity) => Promise<ActivityWeather>;
    /**
     * Transform data from the OpenWeatherMap API to a WeatherSummary.
     * @param data Data from OpenWeatherMap.
     */
    private toWeatherSummary;
}
declare const _default: OpenWeatherMap;
export default _default;
