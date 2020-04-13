import { ActivityWeather, WeatherProvider } from "./types";
import { StravaActivity } from "../strava/types";
/**
 * DarkSky weather API.
 */
export declare class DarkSky implements WeatherProvider {
    private constructor();
    private static _instance;
    static get Instance(): DarkSky;
    /** Weather provider name for Dark Sky. */
    name: string;
    /**
     * Init the Dark Sky wrapper.
     */
    init: () => Promise<void>;
    /**
     * Return the weather for the specified activity.
     * @param activity The Strava activity.
     * @param onlyStart If true, will NOT get weather for the end location.
     */
    getActivityWeather: (activity: StravaActivity, onlyStart?: boolean) => Promise<ActivityWeather>;
    /**
     * Transform data from the Dark Sky API to a WeatherSummary.
     * @param data Data from Dark Sky.
     */
    private toWeatherSummary;
}
declare const _default: DarkSky;
export default _default;
