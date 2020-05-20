// Strautomator Core: Weather types

/**
 * Activity weather summaries (start and end).
 */
export interface ActivityWeather {
    /** Weather at the activity start. */
    start?: WeatherSummary
    /** Weather at the activity end. */
    end?: WeatherSummary
    /** Weather provider. */
    provider?: string
}

/**
 * Weather summary. Most values are strings appended with their units / scales.
 */
export interface WeatherSummary {
    /** Short weather description. */
    summary?: string
    /** Weather unicode icon. */
    icon?: string
    /** Weather icon text. */
    iconText?: string
    /** Actual temperature (celsius). */
    temperature: string
    /** Humidity percentage. */
    humidity: string
    /** Air pressure (hPa). */
    pressure: string
    /** Wind speed (m/s). */
    windSpeed: string
    /** Wind bearing. */
    windBearing: number
    /** Precipitation type (rain, snow, etc), or null. */
    precipType: string
    /** Moon phase (as string). */
    moon?: MoonPhase
}

/**
 * Moon phases.
 */
export enum MoonPhase {
    New = "new",
    Quarter = "quarter",
    Full = "full"
}

/**
 * Weather providers.
 */
export interface WeatherProvider {
    /** Name of the provider (lowercased). */
    name: string
    /** Title of the provider (shown to users). */
    title: string
    /** Main implementation to get an activity weather. */
    getActivityWeather: Function
    /** IMplementation to get current weather. */
    getCurrentWeather: Function
}
