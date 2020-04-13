import { ActivityWeather, WeatherProvider } from "./types";
import { StravaActivity } from "../strava/types";
/**
 * Weatherbit weather API.
 */
export declare class Weatherbit implements WeatherProvider {
    private constructor();
    private static _instance;
    static get Instance(): Weatherbit;
    /** Weather provider name for Weatherbit. */
    name: string;
    /**
     * Init the Weatherbit wrapper.
     */
    init: () => Promise<void>;
    /**
     * Return the weather for the specified activity.
     * @param activity The Strava activity.
     * @param onlyStart If true, will NOT get weather for the end location.
     */
    getActivityWeather: (activity: StravaActivity, onlyStart?: boolean) => Promise<ActivityWeather>;
    /**
     * Transform data from the Weatherbit API to a WeatherSummary.
     * @param data Data from Weatherbit.
     */
    private toWeatherSummary;
}
declare const _default: Weatherbit;
export default _default;
