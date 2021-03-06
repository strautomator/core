// Strautomator Core: Recipe Condition checks

import {RecipeCondition, RecipeOperator} from "./types"
import {StravaActivity} from "../strava/types"
import {UserPreferences} from "../users/types"
import {WeatherSummary} from "../weather/types"
import weather from "../weather"
import _ = require("lodash")
import logger = require("anyhow")
import moment = require("moment")
import polyline = require("@mapbox/polyline")

/**
 * Check if the activity starts, passes on or ends on the specified location.
 * @param activity The Strava activity to be checked.
 * @param condition The location based recipe condition.
 */
export const checkLocation = (activity: StravaActivity, condition: RecipeCondition): boolean => {
    const prop = condition.property
    const op = condition.operator

    // Stop here if activity has no location data.
    if (!activity[prop] || !activity[prop].length) {
        return false
    }

    // Parse condition and activity's coordinates.
    const arr = condition.value.toString().split(",")
    const cLat = parseFloat(arr[0])
    const cLong = parseFloat(arr[1])

    // Checking for a point in the activity polyline, or for a single lat / long?
    let coordinates = prop == "polyline" ? polyline.decode(activity.polyline) : [[activity[prop][0], activity[prop][1]]]
    let radius: number

    // When using "equals" use around 60m radius, and "like" use 650m radius.
    if (op == RecipeOperator.Equal) {
        radius = 0.00055
    } else if (op == RecipeOperator.Like) {
        radius = 0.00592
    } else {
        throw new Error(`Invalid operator ${op} for ${prop}`)
    }

    // Check if activity passed near the specified location.
    for (let [lat, long] of coordinates) {
        if (lat <= cLat + radius && lat >= cLat - radius && long <= cLong + radius && long >= cLong - radius) {
            return true
        }
    }

    logger.debug("Recipes.checkLocation", `Activity ${activity.id}`, condition, `Failed`)
    return false
}

/**
 * Check if the passed datetime (timestamp in seconds) based condition is valid.
 * @param activity The Strava activity to be checked.
 * @param condition The datetime based recipe condition.
 */
export const checkTimestamp = (activity: StravaActivity, condition: RecipeCondition): boolean => {
    const prop = condition.property
    const op = condition.operator

    // Stop here if field has no data on it.
    if (!activity[prop]) {
        return false
    }

    // Parse activity date, considering the UTC offset for start date.
    let aDate = moment.utc(activity[prop])
    if (prop == "dateStart" && activity.utcStartOffset) {
        aDate.add(activity.utcStartOffset, "minutes")
    }

    // Parse condition and activity's date.
    const value = parseInt(condition.value as string)
    const aTime = aDate.seconds() + aDate.minutes() * 60 + aDate.hours() * 3600
    let valid: boolean = true

    // Check it time is greater, less, within 2 minutes, or around 30 minutes of the condition's time.
    if (op == RecipeOperator.GreaterThan) {
        valid = aTime > value
    } else if (op == RecipeOperator.LessThan) {
        valid = aTime < value
    } else if (op == RecipeOperator.Equal) {
        valid = aTime >= value - 120 && aTime <= value + 120
    } else if (op == RecipeOperator.Like) {
        valid = aTime >= value - 1800 && aTime <= value + 1800
    }

    if (!valid) {
        logger.debug("Recipes.checkTimestamp", `Activity ${activity.id}`, condition, `Failed`)
    }

    return valid
}

/**
 * Check if the passed activity is of a type for a sport defined on the condition.
 * @param activity The Strava activity to be checked.
 * @param condition The sport type recipe condition.
 */
export const checkSportType = (activity: StravaActivity, condition: RecipeCondition): boolean => {
    const prop = condition.property
    const op = condition.operator

    // Activity type not set? Stop here.
    if (!activity.type) {
        return false
    }

    // Parse condition and activity's date.
    const value = condition.value.toString()
    const sportType = activity.type.toString()
    let valid: boolean

    // Check if activity sport type matches any set on the condition.
    if (op == RecipeOperator.Equal) {
        valid = value == sportType || value.split(",").indexOf(sportType) >= 0
    } else {
        throw new Error(`Invalid operator ${op} for ${prop}`)
    }

    if (!valid) {
        logger.debug("Recipes.checkSportType", `Activity ${activity.id}`, condition, `Failed`)
    }

    return valid
}

/**
 * Check if the passed date is on the specified week day (0 = Sunday, 6 = Satiurday).
 * @param activity The Strava activity to be checked.
 * @param condition The weekday based recipe condition.
 */
export const checkWeekday = (activity: StravaActivity, condition: RecipeCondition): boolean => {
    const prop = condition.property
    const op = condition.operator

    // No valid start date? Stop here.
    if (!activity["dateStart"]) {
        return false
    }

    // Parse activity date, considering the UTC offset for start date.
    let aDate = moment.utc(activity["dateStart"])
    if (activity.utcStartOffset) {
        aDate.add(activity.utcStartOffset, "minutes")
    }

    // Parse condition and activity's date.
    const value = condition.value.toString()
    const weekday = aDate.day().toString()
    let valid: boolean

    // Check if current week day is selected on the condition.
    if (op == RecipeOperator.Equal) {
        valid = value == weekday || value.split(",").indexOf(weekday) >= 0
    } else {
        throw new Error(`Invalid operator ${op} for ${prop}`)
    }

    if (!valid) {
        logger.debug("Recipes.checkWeekday", `Activity ${activity.id}`, condition, `Failed`)
    }

    return valid
}

/**
 * Check if weather for activity matches the specified condition.
 * @param activity The Strava activity to be checked.
 * @param condition The weather based recipe condition.
 * @param preferences User preferences.
 */
export const checkWeather = async (activity: StravaActivity, condition: RecipeCondition, preferences: UserPreferences): Promise<boolean> => {
    const prop = condition.property
    const op = condition.operator

    // If activity has no location data, stop right here.
    if (!activity.locationStart && !activity.locationEnd) {
        return false
    }

    try {
        let valid: boolean = false

        // Parse condition value and weather property.
        const value = parseInt(condition.value as string)
        const weatherProp = prop.split(".")[1]

        // Get activity weather.
        const weatherSummary = await weather.getActivityWeather(activity, preferences)
        let summary: WeatherSummary

        // Check for weather on start and end of the activity.
        for (summary of [weatherSummary.start, weatherSummary.end]) {
            if (!summary || summary[weatherProp] === null) {
                continue
            }

            let weatherPropValue = summary[weatherProp].replace(/[^\d.-]/g, "")
            if (!isNaN(weatherPropValue)) weatherPropValue = parseFloat(weatherPropValue)

            if (op == RecipeOperator.Equal) {
                valid = valid || weatherPropValue == value
            } else if (op == RecipeOperator.GreaterThan) {
                valid = valid || weatherPropValue > value
            } else if (op == RecipeOperator.LessThan) {
                valid = valid || weatherPropValue < value
            } else {
                throw new Error(`Invalid operator ${op} for ${prop}`)
            }
        }

        if (!valid) {
            logger.debug("Recipes.checkWeather", `Activity ${activity.id}`, condition, `Failed`)
        }

        return valid
    } catch (ex) {
        logger.error("Recipes.checkWeather", `Activity ${activity.id}`, condition, ex)
        return false
    }
}

/**
 * Check if the passed number based condition is valid.
 * @param activity The Strava activity to be checked.
 * @param condition The number based recipe condition.
 */
export const checkNumber = (activity: StravaActivity, condition: RecipeCondition): boolean => {
    const prop = condition.property
    const op = condition.operator

    // No valid number set? Stop here.
    if (_.isNil(activity[prop])) {
        return false
    }

    const value = parseFloat(condition.value as any)
    const diff = value * 0.1
    const aNumber = activity[prop]
    let valid: boolean = true

    if (op == RecipeOperator.Like) {
        valid = value < aNumber + diff && value > aNumber - diff
    } else if (op == RecipeOperator.Equal && Math.round(aNumber) != Math.round(value)) {
        valid = false
    } else if (op == RecipeOperator.GreaterThan && aNumber <= value) {
        valid = false
    } else if (op == RecipeOperator.LessThan && aNumber >= value) {
        valid = false
    }

    if (!valid) {
        logger.debug("Recipes.checkNumber", `Activity ${activity.id}`, condition, `Failed`)
    }

    return valid
}

/**
 * Check if the passed text / string based condition is valid.
 * @param activity The Strava activity to be checked.
 * @param condition The text / string based recipe condition.
 */
export const checkText = (activity: StravaActivity, condition: RecipeCondition): boolean => {
    const prop = condition.property
    const op = condition.operator

    // No valid number set? Stop here.
    if (_.isNil(activity[prop])) {
        return false
    }

    // Parse condition and activity's lowercased values.
    const value = condition.value.toString().toLowerCase()
    const aText = activity[prop].toString().toLowerCase()
    let valid: boolean = true

    if (op == RecipeOperator.Equal && aText != value) {
        valid = false
    } else if (op == RecipeOperator.Like && aText.indexOf(value) < 0) {
        valid = false
    } else if (op == RecipeOperator.GreaterThan || op == RecipeOperator.LessThan) {
        throw new Error(`Invalid operator ${op} for ${prop}`)
    }

    if (!valid) {
        logger.debug("Recipes.checkText", `Activity ${activity.id}`, condition, `Failed`)
    }

    return valid
}
