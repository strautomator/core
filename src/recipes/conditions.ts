// Strautomator Core: Recipe Condition checks

import {RecipeCondition, RecipeOperator} from "./types"
import {StravaActivity} from "../strava/types"
import {UserPreferences} from "../users/types"
import {WeatherSummary} from "../weather/types"
import weather from "../weather"
import logger = require("anyhow")
import moment = require("moment")

/**
 * Check if the passed location based condition is valid.
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
    const activityLat = activity[prop][0]
    const activityLong = activity[prop][1]
    let radius

    // When using "equals" use around 60m radius, and "like" use 650m radius.
    if (op == RecipeOperator.Equal) {
        radius = 0.00055
    } else if (op == RecipeOperator.Like) {
        radius = 0.00592
    } else {
        throw new Error(`Invalid operator ${op} for ${prop}`)
    }

    // Check if activity start / end location matches the one defined on the condition.
    const valid = activityLat <= cLat + radius && activityLat >= cLat - radius && activityLong <= cLong + radius && activityLong >= cLong - radius

    if (!valid) {
        logger.debug("Recipes.checkLocation", `Activity ${activity.id}`, condition, `Failed`)
    }

    return valid
}

/**
 * Check if the passed date time based condition is valid.
 * @param activity The Strava activity to be checked.
 * @param condition The date time based recipe condition.
 */
export const checkTimestamp = (activity: StravaActivity, condition: RecipeCondition): boolean => {
    const prop = condition.property
    const op = condition.operator

    // Stop here if field has no data on it.
    if (!activity[prop]) {
        return false
    }

    // Parse condition and activity's date.
    const value = parseInt(condition.value as string)
    const aTime = parseInt(moment(activity[prop]).format("Hmm"))
    let valid: boolean = true

    // Check it time is greater, less or around 15min of the condition's time.
    if (op == RecipeOperator.GreaterThan) {
        valid = value > aTime
    } else if (op == RecipeOperator.LessThan) {
        valid = value < aTime
    } else if (op == RecipeOperator.Like) {
        valid = value >= aTime - 20 && value <= aTime + 20
    } else if (op == RecipeOperator.Equal) {
        valid = value >= aTime - 1 && value <= aTime + 1
    }

    if (!valid) {
        logger.debug("Recipes.checkTimestamp", `Activity ${activity.id}`, condition, `Failed`)
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

    // Parse condition and activity's date.
    const value = parseInt(condition.value as string)
    const weekday = moment(activity["dateStart"]).day()
    let valid: boolean

    // Check it time is greater, less or around 15min of the condition's time.
    if (op == RecipeOperator.Equal) {
        valid = value == weekday
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

            const weatherPropValue = summary[weatherProp].replace(/[^\d.-]/g, "")

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

    const value = condition.value
    const aNumber = activity[prop]
    let valid: boolean = true

    if (op == RecipeOperator.Equal && aNumber != value) {
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

    // Parse condition and activity's lowercased values.
    const value = condition.value.toString().toLowerCase()
    const aText = activity[prop].toString().toLowerCase()
    let valid: boolean = true

    if (op == RecipeOperator.Equal && aText != value) {
        valid = false
    } else if (op == RecipeOperator.Like && aText.indexOf(value) < 0) {
        valid = false
    } else {
        throw new Error(`Invalid operator ${op} for ${prop}`)
    }

    if (!valid) {
        logger.debug("Recipes.checkText", `Activity ${activity.id}`, condition, `Failed`)
    }

    return valid
}
