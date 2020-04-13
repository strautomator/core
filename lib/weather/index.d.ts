import { ActivityWeather, WeatherProvider } from "./types";
import { StravaActivity } from "../strava/types";
/**
 * Weather APIs wrapper.
 */
export declare class Weather {
    private constructor();
    private static _instance;
    static get Instance(): Weather;
    /**
     * List of weather providers (as modules).
     */
    providers: WeatherProvider[];
    /**
     * Init the Weather wrapper.
     */
    init: () => Promise<void>;
    /**
     * Return the weather for the specified activity.
     * @param activity The Strava activity.
     * @param provider The prefered weather provider, use DarkSky by default.
     */
    getActivityWeather: (activity: StravaActivity, provider?: string) => Promise<ActivityWeather>;
    /**
     * Process weather result to get correct icon, remove invalid fields etc..
     * @param weather The activity weather details.
     */
    processWeather: (weather: ActivityWeather) => void;
}
declare const _default: Weather;
export default _default;
