// Strautomator Core: Weather types

import Bottleneck from "bottleneck"

/**
 * Activity weather summaries (start and end).
 */
export interface ActivityWeather {
    /** Weather at the activity start. */
    start?: WeatherSummary
    /** Weather at the activity end. */
    end?: WeatherSummary
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
 * Sunrise and sunset details.
 */
export interface Suntimes {
    /** Sunrise, will be null if sun never rises. */
    sunrise?: string
    /** Sunset, will be null if sun never sets. */
    sunset?: string
    /** Optional time of day, if a date was passed when calculating the sun times. */
    timeOfDay: "day" | "night"
}

/**
 * Weather providers.
 */
export interface WeatherProvider {
    /** Name of the provider (lowercased). */
    name: string
    /** Title of the provider (shown to users). */
    title: string
    /** How many hours back in time can the weather provider go? */
    maxHours: number
    /** Get the weather for the specified location and date. */
    getWeather: Function
    /** API rate limiter, instantiated by the Weather Manager. */
    apiRequest?: Bottleneck
    /** Weather API stats. */
    stats?: WeatherApiStats
    /** Disable this weather provider till the specified date. */
    disabledTillDate?: Date
}

/**
 * Weather summary. Most values are strings appended with their units / scales.
 */
export interface WeatherSummary {
    /** Name of the provider. */
    provider?: string
    /** Short weather description. */
    summary?: string
    /** Actual temperature. */
    temperature: string | number
    /** "Feels like" temperature. */
    feelsLike: string | number
    /** Humidity percentage. */
    humidity: string | number
    /** Air pressure (hPa). */
    pressure: string | number
    /** Wind speed (m/s). */
    windSpeed: string | number
    /** Wind direction. */
    windDirection: string | number
    /** Cloud coverage, percentage. */
    cloudCover: string | number
    /** Precipitation type (rain, drizzle, snow etc), or none. */
    precipitation?: string
    /** Visibility distance. */
    visibility?: number
    /** Moon phase (as string). */
    moon?: MoonPhase
    /** Weather unicode icon. */
    icon?: string
    /** Extra data for summary calculation, this will be removed after the weather summary has processed. */
    extraData?: {
        /** Day or night? */
        timeOfDay?: "day" | "night"
        /** Weather icon text. This flag will be removed after the weather summary has processed. */
        iconText?: string
        /** Precipitation quantity. */
        mmPrecipitation?: number
    }
}

/**
 * Weather API daily statistics.
 */
export interface WeatherApiStats {
    /** Request count. */
    requestCount: number
    /** How many errors. */
    errorCount: number
    /** Date of last request. */
    lastRequest: Date
}
