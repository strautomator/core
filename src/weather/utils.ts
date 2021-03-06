// Strautomator Core: Weather Utils

import {MoonPhase, WeatherProvider, WeatherSummary} from "./types"
import {UserPreferences} from "../users/types"
import Bottleneck from "bottleneck"
import logger = require("anyhow")
import moment = require("moment")

/**
 * Helper to get an API rate limiter (bottleneck) for the specified provider.
 * @param provider Weather provider object.
 * @param options Options (taken from settings).
 */
export function apiRateLimiter(provider: WeatherProvider, options: any): Bottleneck {
    const limiter = new Bottleneck({
        maxConcurrent: options.maxConcurrent,
        reservoir: options.perHour,
        reservoirRefreshAmount: options.perHour,
        reservoirRefreshInterval: 1000 * 60 * 60
    })

    // Set API request stats.
    limiter.on("queued", () => {
        const stats = provider.stats
        const newDay = stats.lastRequest && stats.lastRequest.getDate() < new Date().getDate()

        if (newDay) {
            logger.debug(`Weather.${provider.name}.limiter`, `Daily stats reset`)
            stats.errorCount = 0
            stats.requestCount = 0
        }

        stats.requestCount++
        stats.lastRequest = new Date()
    })

    // Catch errors.
    limiter.on("error", (err) => {
        provider.stats.errorCount++
        logger.error(`Weather.${provider.name}.limiter`, err)
    })

    // Rate limiting warnings
    limiter.on("depleted", () => {
        logger.warn(`Weather.${provider.name}.limiter`, "Rate limited")
    })

    return limiter
}

/**
 * Process the passed weather summary to transformand add missing fields.
 * Numeric data passed as string will be untouched, while actual numbers
 * will be processed (converting to proper units and adding the suffixes).
 * @param summary The weather summary to be processed.
 */
export function processWeatherSummary(summary: WeatherSummary, date: Date, preferences: UserPreferences): void {
    try {
        let hour = date.getHours()
        let unicode: string = "2601"

        // No precipitation? Set to none, otherwise make sure it's lowercased.
        if (!summary.precipType) {
            summary.precipType = "none"
        } else {
            summary.precipType = summary.precipType.toLowerCase()
        }

        // Set missing icon text, otherwise make sure it's lowercased and with dashes.
        if (!summary.iconText) {
            let iconText = "clear"
            if (summary.precipType == "snow") iconText = "snow"
            else if (summary.precipType == "rain") iconText = "rain"
            else if (summary.cloudCover > 50) iconText = "cloudy"
            else if (summary.cloudCover > 20) iconText = "partly-cloudy"
            else if (summary.cloudCover > 10) iconText = "mostly-clear"

            summary.iconText = iconText
        }

        // Set correct day / night icons.
        if (summary.iconText == "clear") {
            summary.iconText = hour > 5 && hour < 20 ? "clear-day" : "clear-night"
        }

        // Property select correct weather icon.
        switch (summary.iconText) {
            case "clear-day":
                unicode = "2600"
                break
            case "rain":
            case "drizzle":
                unicode = "1F327"
                break
            case "hail":
            case "ice-pellets":
            case "ice-pellets-light":
            case "ice-pellets-heavy":
                unicode = "1F327"
                break
            case "snow":
            case "snow-light":
            case "snow-heavy":
                unicode = "2744"
                break
            case "sleet":
            case "flurries":
            case "freezing-rain":
            case "freezing-rain-light":
            case "freezing-rain-heavy":
                unicode = "1F328"
                break
            case "wind":
                unicode = "1F32C"
                break
            case "fog":
                unicode = "1F32B"
                break
            case "cloudy":
            case "mostly-cloudy":
                unicode = "2601"
                break
            case "partly-cloudy":
            case "partly-cloudy-day":
                unicode = "26C5"
                break
            case "tstorm":
            case "thunderstorm":
                unicode = "26C8"
                break
            case "tornado":
                unicode = "1F32A"
                break
            case "mostly-clear":
            case "partly-cloudy-night":
                unicode = "1F319"
                break
            case "clear-night":
                unicode = summary.moon == MoonPhase.Full ? "1F316" : "1F312"
                break
        }

        // Convert code to unicode emoji.
        if (unicode) {
            summary.icon = String.fromCodePoint(parseInt(unicode, 16))
        }

        // Temperature summary.
        let tempSummary = "cool"
        if (summary.temperature > 40) tempSummary = "Extremely warm"
        else if (summary.temperature > 30) tempSummary = "Very warm"
        else if (summary.temperature > 22) tempSummary = "Warm"
        else if (summary.temperature < -10) tempSummary = "Extremely cold"
        else if (summary.temperature < 2) tempSummary = "Very cold"
        else if (summary.temperature < 12) tempSummary = "Cold"

        // Temperature.
        const tempUnit = preferences.weatherUnit == "f" ? "F" : "C"
        if (preferences.weatherUnit == "f") {
            summary.temperature = celsiusToFahrenheit(summary.temperature as number)
        }
        summary.temperature = `${Math.round(summary.temperature as number)}°${tempUnit}`

        // Humidity.
        if (summary.humidity !== null) {
            summary.humidity = `${Math.round(summary.humidity as number)}%`
        }

        // Pressure.
        if (summary.pressure !== null) {
            summary.pressure = `${Math.round(summary.pressure as number)} hPa`
        }

        // Wind summary.
        const isWindy = summary.windSpeed && summary.windSpeed > 20

        // Wind speed.
        if (summary.windSpeed !== null) {
            const windUnit = preferences.weatherUnit == "f" ? "mph" : "kph"
            const windSpeed = windUnit == "mph" ? msToMph(summary.windSpeed as number) : msToKph(summary.windSpeed as number)
            summary.windSpeed = `${Math.round(windSpeed)} ${windUnit}`
        }

        // Wind direction.
        if (summary.windDirection !== null) {
            summary.windDirection = degToDirection(summary.windDirection as number)
        }

        // Cloud coverage.
        if (summary.cloudCover !== null) {
            summary.cloudCover = `${(summary.cloudCover as number).toFixed(0)}%`
        }

        // No summary yet? Set one now.
        if (!summary.summary) {
            const arr = summary.iconText.split("-")
            const baseSummary = arr.length > 1 ? `${arr[0]} ${arr[1]}` : arr[0]
            summary.summary = `${tempSummary}, ${baseSummary}`

            if (isWindy) summary.summary += ", windy"
        }

        // Set moon phase.
        summary.moon = getMoonPhase(date)

        // The iconText is not needed anymore.
        delete summary.iconText
    } catch (ex) {
        logger.error("Weather.processWeatherSummary", date.toISOString(), Object.values(summary).join(", "), ex)
    }
}

/**
 * Helper to get a single liner with the summary of a weather summary.
 * @param coordinates Coordinates.
 * @param date The date.
 * @param summary The parsed weather summary.
 */
export function weatherSummaryString(coordinates: [number, number], date: Date, summary: WeatherSummary): string {
    const dateFormat = moment(date).format("YYYY-MM-DD HH:mm")
    return `${coordinates.join(", ")} - ${dateFormat} - ${summary.summary} - temp: ${summary.temperature}, humidity: ${summary.humidity}, precipitation: ${summary.precipType}`
}

/**
 * Get the moon phase for the specified date.
 * @param date Date to get the moon phase for.
 */
export function getMoonPhase(date: Date): MoonPhase {
    let year = date.getFullYear()
    let month = date.getMonth() + 1
    let day = date.getDate()
    let zone = date.getTimezoneOffset() / 1440
    let phase

    if (month < 3) {
        year--
        month += 12
    }

    let c = 365.25 * year
    let e = 30.6 * month

    // Get total elapsed days and divide by moon cycle.
    let jd = c + e + day + zone - 694039.09
    jd /= 29.5305882

    // Get only the integer part of the result and leave fractional part out.
    phase = parseInt(jd.toString())
    jd -= phase

    // Here's the actual moon phase. From 0 (new moon) to 4 (full moon) to 7 (waning crescent).
    phase = Math.round(jd * 8)
    if (phase >= 8) phase = 0

    // Return  moon phase.
    if (phase == 0) return MoonPhase.New
    if (phase == 4) return MoonPhase.Full
    return MoonPhase.Quarter
}

/**
 * Convert Celsius to Fahrenheit.
 * @param celsius Temperature in celsius.
 */
export function celsiusToFahrenheit(celsius: number): number {
    return Math.round((celsius * 9) / 5 + 32)
}

/**
 * Convert meters / second to kph.
 * @param ms Meters per second.
 */
export function msToKph(ms: number): number {
    return Math.round(ms * 3.6)
}

/**
 * Convert meters / second to kph.
 * @param ms Meters per second.
 */
export function msToMph(ms: number): number {
    return Math.round(ms * 2.24)
}

/**
 * Converts bearing (degrees) to a text direction.
 * @param deg Bearing value from 0 to 359.
 */
export function degToDirection(deg: number): string {
    const value = Math.floor(deg / 22.5 + 0.5)
    const directions = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"]
    return directions[value % 16]
}
