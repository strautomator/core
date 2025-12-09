// Strautomator Core: Weather Utils

import {MoonPhase, Suntimes, WeatherProvider, WeatherSummary} from "./types"
import {UserPreferences} from "../users/types"
import {translation} from "../translations"
import Bottleneck from "bottleneck"
import _ from "lodash"
import logger from "anyhow"
import dayjs from "../dayjs"
const settings = require("setmeup").settings

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
 * Process the passed weather summary to transform and add missing fields.
 * Numeric data passed as string will be untouched, while actual numbers
 * will be processed (converting to proper units and adding the suffixes).
 * @param summary The weather summary to be processed.
 * @param dDate The date (as a DayJS object).
 * @param preferences User preferences.
 */
export function processWeatherSummary(summary: WeatherSummary, dDate: dayjs.Dayjs, preferences: UserPreferences): void {
    const date = dDate.toDate()

    // Default preferences.
    if (!preferences) preferences = {}

    try {
        const tempValue = !_.isNil(summary.temperature) ? parseFloat(summary.temperature.toString()) : null
        const humidityValue = !_.isNil(summary.humidity) ? parseFloat(summary.humidity.toString()) : null
        const pressureValue = !_.isNil(summary.pressure) ? parseFloat(summary.pressure.toString()) : null
        const prcFog = translation("Fog", preferences)
        const prcDrizzle = translation("Drizzle", preferences)
        const prcRain = translation("Rain", preferences)
        const prcSleet = translation("Sleet", preferences)
        const prcSnow = translation("Snow", preferences)

        let extraData = summary.extraData || {}

        // Calculate air density.
        if (humidityValue && pressureValue) {
            summary.airDensity = getAirDensity(tempValue, pressureValue, humidityValue) + " kg/m³"
        }

        // No precipitation? Try calculating it based on the precipitation mm (if passed).
        // If no precipitation, then set it to "dry".
        if (!summary.precipitation || !_.isString(summary.precipitation)) {
            const mm = extraData.mmPrecipitation || 0

            if (mm > 0) {
                if (tempValue < 1) summary.precipitation = prcSnow
                else if (tempValue < 4) summary.precipitation = prcSleet
                else if (mm < 1) summary.precipitation = prcDrizzle
                else summary.precipitation = prcRain

                // Heavy precipitation? Append suffix.
                if (mm > 20) {
                    summary.precipitation = `${summary.precipitation} (${translation("Heavy", preferences)})`
                }
            } else {
                summary.precipitation = translation("Dry", preferences)
            }
        } else {
            summary.precipitation = translation(summary.precipitation, preferences)
        }

        summary.precipitation = summary.precipitation.toLowerCase()

        // Set missing icon text.
        if (!extraData.iconText || extraData.iconText.length < 3) {
            let lPrecipitation = summary.precipitation ? summary.precipitation.toLowerCase() : ""
            let lSummary = summary.summary ? summary.summary.toLowerCase() : ""
            let cloudCover = summary.cloudCover as any
            let iconText = "Clear"

            if (lPrecipitation == prcSnow || lSummary.includes(prcSnow)) iconText = "Snow"
            else if (lPrecipitation == prcRain || lSummary.includes(prcRain) || extraData.mmPrecipitation > 3) iconText = "Rain"
            else if (summary.visibility <= 1 || lSummary.includes(prcFog)) iconText = "Fog"
            else if (cloudCover > 70) iconText = "Cloudy"
            else if (cloudCover > 30) iconText = "MostlyCloudy"
            else if (cloudCover > 10) iconText = "MostlyClear"

            extraData.iconText = iconText
        }

        // Temperature summary.
        let tempSummary = translation("Cool", preferences)
        if (tempValue > 40) tempSummary = translation("ExtremelyWarm", preferences)
        else if (tempValue > 30) tempSummary = translation("VeryWarm", preferences)
        else if (tempValue > 22) tempSummary = translation("Warm", preferences)
        else if (tempValue < -10) tempSummary = translation("ExtremelyCold", preferences)
        else if (tempValue < 2) tempSummary = translation("VeryCold", preferences)
        else if (tempValue < 12) tempSummary = translation("Cold", preferences)

        // Make sure the "feels like" temperature is set.
        if (_.isNil(summary.feelsLike)) {
            summary.feelsLike = summary.temperature
        }

        // Temperature conversion.
        const tempUnit = preferences.weatherUnit == "f" ? "F" : "C"
        if (preferences.weatherUnit == "f") {
            summary.feelsLike = celsiusToFahrenheit(summary.feelsLike as number)
            summary.temperature = celsiusToFahrenheit(summary.temperature as number)
            if (!_.isNil(summary.dewPoint)) {
                summary.dewPoint = celsiusToFahrenheit(summary.dewPoint as number)
            }
        }
        summary.feelsLike = `${Math.round(summary.feelsLike as number)}°${tempUnit}`
        summary.temperature = `${Math.round(summary.temperature as number)}°${tempUnit}`

        // Dew point.
        if (!_.isNil(summary.dewPoint)) {
            summary.dewPoint = `${Math.round(summary.dewPoint as number)}°${tempUnit}`
        }

        // Humidity.
        if (!_.isNil(summary.humidity)) {
            summary.humidity = `${Math.round(summary.humidity as number)}%`
        }

        // Pressure.
        if (!_.isNil(summary.pressure)) {
            summary.pressure = `${Math.round(summary.pressure as number)} hPa`
        }

        // Wind summary.
        const isWindy = (summary.windSpeed && (summary.windSpeed as number) > 20) || (summary.windGust && (summary.windGust as number) > 40)
        const windUnit = preferences.windSpeedUnit ? preferences.windSpeedUnit : preferences.weatherUnit == "f" ? "mph" : "kph"
        if (!_.isNil(summary.windSpeed)) {
            const windSpeed = windUnit == "m/s" ? summary.windSpeed : windUnit == "mph" ? msToMph(summary.windSpeed as number) : msToKph(summary.windSpeed as number)
            summary.windSpeed = `${Math.round(windSpeed as number)} ${translation(windUnit, preferences)}`
        }
        if (!_.isNil(summary.windGust)) {
            const windGust = windUnit == "m/s" ? summary.windGust : windUnit == "mph" ? msToMph(summary.windGust as number) : msToKph(summary.windGust as number)
            summary.windGust = `${Math.round(windGust as number)} ${translation(windUnit, preferences)}`
        }
        if (!_.isNil(summary.windDirection)) {
            const direction = degToDirection(summary.windDirection as number)
            summary.windDirection = translation(`Directions.${direction}`, preferences)
        }

        // Cloud coverage.
        if (!_.isNil(summary.cloudCover)) {
            summary.cloudCover = `${(summary.cloudCover as number).toFixed(0)}%`
        }

        // Set moon phase.
        summary.moon = getMoonPhase(date)

        // Select correct weather icon. Defaults to cloudy.
        summary.icon = "☁️"
        switch (extraData.iconText) {
            case "Clear":
                if (extraData.timeOfDay == "day") {
                    summary.icon = "☀️"
                } else if (summary.moon == MoonPhase.Full) {
                    summary.icon = "🌕"
                } else {
                    summary.icon = "🌙"
                }
                break
            case "MostlyClear":
                summary.icon = "🌤️"
                break
            case "Cloudy":
            case "MostlyCloudy":
                if (extraData.timeOfDay == "day") {
                    summary.icon = "☁️"
                } else {
                    summary.icon = "🌙"
                }
                break
            case "Drizzle":
            case "Rain":
                summary.icon = "🌧️"
                break
            case "Snow":
                summary.icon = "❄️"
                break
            case "Sleet":
                summary.icon = "🌨️"
                break
            case "Wind":
            case "Windy":
                summary.icon = "💨"
                break
            case "Fog":
            case "Foggy":
                summary.icon = "😶‍🌫️"
                break
            case "Thunderstorm":
                summary.icon = "⛈️"
                break
            case "Tornado":
                summary.icon = "🌪️"
                break
            case "Cyclone":
            case "Hurricane":
                summary.icon = "🌀"
        }

        // Air quality index.
        if (!_.isNil(summary.aqi)) {
            summary.aqiIcon = "🟢"
            switch (summary.aqi) {
                case 1:
                    summary.aqiIcon = "🟡"
                    break
                case 2:
                    summary.aqiIcon = "🟠"
                    break
                case 3:
                    summary.aqiIcon = "🔴"
                    break
                case 4:
                    summary.aqiIcon = "🟣"
                    break
                case 5:
                    summary.aqiIcon = "🟤"
            }
        }

        // Summary set? Check if it has a translation. If unset, set one now.
        if (summary.summary) {
            summary.summary = translation(summary.summary, preferences)
        } else {
            summary.summary = `${tempSummary}, ${translation(extraData.iconText, preferences)}`
            if (isWindy) summary.summary += `, ${translation("Windy", preferences)}`
        }

        // Replace empty strings (if defined via settings).
        for (let key of Object.keys(summary)) {
            if (summary[key] === "" || summary[key] === null) {
                summary[key] = settings.weather.emptyString
            }
        }

        // Final trimmed summary should be always Capital cased.
        summary.summary = (summary.summary.charAt(0).toUpperCase() + summary.summary.slice(1)).trim()
    } catch (ex) {
        const filteredProps = Object.keys(summary).filter((key) => !_.isNil(summary[key]))
        const weatherProps = filteredProps.map((key) => `${key}: ${summary[key]}`)
        throw new Error(`Failed to process weather summary: ${ex.message} | ${weatherProps.join(" | ")}`)
    } finally {
        delete summary.extraData
    }
}

/**
 * Helper to get a single liner for the weather summary.
 * @param summary The parsed weather summary.
 */
export function weatherSummaryString(summary: WeatherSummary): string {
    const weatherProps = ["temperature", "windSpeed"].map((key) => `${key}: ${summary[key]}`)
    return `${summary.summary} (${weatherProps.join(", ")})`
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
 * Get the sunrise and sunset on the specified coordinates / date.
 * Largely based on https://www.npmjs.com/package/suncalc.
 * @param coordinates Latitude and longitude.
 * @param dDate The date (as a DayJS object).
 */
export function getSuntimes(coordinates: [number, number], dDate: dayjs.Dayjs): Suntimes {
    const dateString = dDate.format("HH:mm")
    const tzOffset = dDate.utcOffset()

    const rad = Math.PI / 180
    const dayMs = 1000 * 60 * 60 * 24
    const J1970 = 2440588
    const J2000 = 2451545
    const e = rad * 23.4397
    const J0 = 0.0009

    const toJulian = (date) => date.valueOf() / dayMs - 0.5 + J1970
    const fromJulian = (j) => dayjs(new Date((j + 0.5 - J1970) * dayMs)).utcOffset(tzOffset)
    const julianCycle = (d, lw) => Math.round(d - J0 - lw / (2 * Math.PI))
    const solarMeanAnomaly = (d) => rad * (357.5291 + 0.98560028 * d)
    const toDays = (date) => toJulian(date) - J2000
    const approxTransit = (Ht, lw, n) => J0 + (Ht + lw) / (2 * Math.PI) + n
    const solarTransitJ = (ds, M, L) => J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L)
    const hourAngle = (h, phi, d) => Math.acos((Math.sin(h) - Math.sin(phi) * Math.sin(d)) / (Math.cos(phi) * Math.cos(d)))
    const observerAngle = (height) => (-2.076 * Math.sqrt(height)) / 60
    const declination = (l, b) => Math.asin(Math.sin(b) * Math.cos(e) + Math.cos(b) * Math.sin(e) * Math.sin(l))
    const getSetJ = (h, lw, phi, dec, n, M, L) => solarTransitJ(approxTransit(hourAngle(h, phi, dec), lw, n), M, L)
    const eclipticLongitude = (M) => {
        const C = rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M))
        const P = rad * 102.9372
        return M + C + P + Math.PI
    }

    const lat = coordinates[0]
    const lng = coordinates[1]
    const date = dDate.toDate()
    const lw = rad * -lng
    const phi = rad * lat
    const dh = observerAngle(20)
    const d = toDays(date)
    const n = julianCycle(d, lw)
    const ds = approxTransit(0, lw, n)
    const M = solarMeanAnomaly(ds)
    const L = eclipticLongitude(M)
    const dec = declination(L, 0)
    const Jnoon = solarTransitJ(ds, M, L)
    const h0 = (-0.833 + dh) * rad
    const Jset = getSetJ(h0, lw, phi, dec, n, M, L)
    const Jrise = Jnoon - (Jset - Jnoon)

    const sunrise = fromJulian(Jrise).format("HH:mm")
    const sunset = fromJulian(Jset).format("HH:mm")
    const timeOfDay = dateString >= sunrise && dateString <= sunset ? "day" : "night"
    const result: Suntimes = {
        sunrise,
        sunset,
        timeOfDay
    }

    logger.debug("Weather.getSuntimes", coordinates.join(", "), dDate.format("YYYY-MM-DD HH:mm:ss"), `${result.sunrise} - ${result.sunset}`)
    return result
}

/**
 * Estimate the air density based on temperature, pressure and relative humidity.
 * @param temperature Temperature in Celsius.
 * @param pressure Pressure in hPa.
 * @param humidity Humidity in percentage.
 */
export const getAirDensity = (temperature: number, pressure: number, humidity: number): number => {
    const R = 287.05
    const vaporPressure = (humidity / 100) * 5 * Math.exp((17.27 * temperature) / (237.77 + temperature))

    // Temperature in Kelvin, pressure in Pa, humidity in decimal.
    temperature = temperature + 273.15
    pressure = pressure * 100
    humidity = humidity / 100

    const density = pressure / (R * temperature) - (vaporPressure * 100) / (611.5 * temperature)
    return Math.round(density * 1000) / 1000
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
