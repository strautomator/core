// Strautomator Core: Weather Utils

import {MoonPhase, WeatherSummary} from "./types"
import logger = require("anyhow")

/**
 * Process the passed weather summary to transformand add missing fields.
 * @param summary The weather summary to be processed.
 */
export function processWeatherSummary(summary: WeatherSummary, date: Date): void {
    try {
        let unicode: string = "2601"

        // Set moon phase.
        summary.moon = getMoonPhase(date)

        // Set defaults.
        if (!summary.precipType) {
            summary.precipType = null
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

        // No precipitation?
        if (!summary.precipType) {
            summary.precipType = null
        }

        // No summary yet? Set one now.
        if (!summary.summary) {
            const arr = summary.iconText.split("-")

            let text = arr[0]
            if (arr.length > 1) {
                text += " " + arr[1]
            }

            summary.summary = text
        }
    } catch (ex) {
        logger.error("Weather.processWeatherSummary", ex)
    }
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
