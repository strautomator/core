// Strautomator Core: Recipe Condition checks

import {RecipeCondition, RecipeOperator} from "./types"
import {StravaActivity} from "../strava/types"
import {UserData} from "../users/types"
import {WeatherSummary} from "../weather/types"
import spotify from "../spotify"
import strava from "../strava"
import weather from "../weather"
import _ = require("lodash")
import logger = require("anyhow")
import dayjs from "../dayjs"
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
    if (!activity[prop]) {
        return false
    }

    // Parse condition and activity's coordinates.
    const arr = condition.value.toString().split(",")
    const cLat = parseFloat(arr[0])
    const cLong = parseFloat(arr[1])

    // Checking for a point in the activity polyline, or for a single lat / long?
    let coordinates: [number[]]
    let radius: number

    // Bug with the Strava API not returning the end location, so we use the polyline instead.
    if (prop == "locationEnd" && activity.polyline && !activity.locationEnd.length) {
        logger.info("Recipes.checkLocation", `Activity ${activity.id}`, "Using the polyline due to empty locationEnd")
        coordinates = [polyline.decode(activity.polyline).pop()]
    } else if (prop == "polyline") {
        coordinates = polyline.decode(activity.polyline)
    } else if (activity[prop].length) {
        coordinates = [[activity[prop][0], activity[prop][1]]]
    } else {
        return false
    }

    // When using "equals" use around 60m radius, and "like" use 650m radius.
    if (op == RecipeOperator.Equal) {
        radius = 0.000556
    } else if (op == RecipeOperator.Approximate) {
        radius = 0.002735
    } else if (op == RecipeOperator.Like) {
        radius = 0.005926
    } else {
        throw new Error(`Invalid operator ${op} for ${prop}`)
    }

    // Check if activity passed near the specified location.
    for (let [lat, long] of coordinates) {
        if (lat <= cLat + radius && lat >= cLat - radius && long <= cLong + radius && long >= cLong - radius) {
            return true
        }
    }

    logger.debug("Recipes.checkLocation", `Activity ${activity.id}`, condition, "Failed")
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

    let aTime: number = 0
    let valid: boolean = true
    const value = parseInt(condition.value as string)

    // Parse activity time or date.
    if (prop.includes("Time")) {
        aTime = activity[prop]
    } else {
        let aDate = dayjs.utc(activity[prop])
        if (prop == "dateStart" && activity.utcStartOffset) {
            aDate = aDate.add(activity.utcStartOffset, "minutes")
        }

        aTime = aDate.second() + aDate.minute() * 60 + aDate.hour() * 3600
    }

    // Check it time is greater, less, within 2 minutes, or around 30 minutes of the condition's time.
    if (op == RecipeOperator.GreaterThan) {
        valid = aTime > value
    } else if (op == RecipeOperator.LessThan) {
        valid = aTime < value
    } else if (op == RecipeOperator.Equal) {
        valid = aTime >= value - 120 && aTime <= value + 120
    } else if (op == RecipeOperator.Approximate) {
        valid = aTime >= value - 600 && aTime <= value + 600
    } else if (op == RecipeOperator.Like) {
        valid = aTime >= value - 1800 && aTime <= value + 1800
    }

    if (!valid) {
        logger.debug("Recipes.checkTimestamp", `Activity ${activity.id}`, condition, "Failed")
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

    // Activity sport not set? Stop here.
    if (!activity.sportType) {
        return false
    }

    // Parse condition values.
    const value = condition.value.toString()
    const sportType = activity.sportType.toString()
    let valid: boolean

    // Check if activity sport type matches any set on the condition.
    if (op == RecipeOperator.Equal) {
        valid = value == sportType || value.split(",").includes(sportType)
    } else {
        throw new Error(`Invalid operator ${op} for ${prop}`)
    }

    if (!valid) {
        logger.debug("Recipes.checkSportType", `Activity ${activity.id}`, condition, "Failed")
    }

    return valid
}

/**
 * Check if the passed activity was made with the specified gear.
 * @param activity The Strava activity to be checked.
 * @param condition The gear recipe condition.
 */
export const checkGear = (activity: StravaActivity, condition: RecipeCondition): boolean => {
    const prop = condition.property
    const op = condition.operator

    // Activity sport not set? Stop here.
    if (!activity.gear) {
        return false
    }

    // Parse condition values.
    const value = condition.value.toString()
    const gear = activity.gear.id
    let valid: boolean

    // Check if gear matches any set on the condition.
    if (op == RecipeOperator.Equal) {
        valid = value == gear || value.split(",").includes(gear)
    } else {
        throw new Error(`Invalid operator ${op} for ${prop}`)
    }

    if (!valid) {
        logger.debug("Recipes.checkGear", `Activity ${activity.id}`, condition, "Failed")
    }

    return valid
}

/**
 * Check if the passed activity has broken new all time / segment / KOM records.
 * @param activity The Strava activity to be checked.
 * @param condition The weekday based recipe condition.
 */
export const checkNewRecords = (activity: StravaActivity, condition: RecipeCondition): boolean => {
    const prop = activity[condition.property]
    const yes = prop && prop.length > 0
    const no = !prop || prop.length == 0
    const valid = condition.value === true ? yes : no

    if (!valid) {
        logger.debug("Recipes.checkNewRecords", `Activity ${activity.id}`, condition, "Failed")
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
    let aDate = dayjs.utc(activity["dateStart"])
    if (activity.utcStartOffset) {
        aDate = aDate.add(activity.utcStartOffset, "minutes")
    }

    // Parse condition and activity's date.
    const value = condition.value.toString()
    const weekday = aDate.day().toString()
    let valid: boolean

    // Check if current week day is selected on the condition.
    if (op == RecipeOperator.Equal) {
        valid = value == weekday || value.split(",").includes(weekday)
    } else {
        throw new Error(`Invalid operator ${op} for ${prop}`)
    }

    if (!valid) {
        logger.debug("Recipes.checkWeekday", `Activity ${activity.id}`, condition, "Failed")
    }

    return valid
}

/**
 * Check if the passed number based condition is valid.
 * @param activity The Strava activity to be checked.
 * @param condition The number based recipe condition.
 */
export const checkNumber = (activity: StravaActivity, condition: RecipeCondition): boolean => {
    const prop = condition.property
    const op = condition.operator
    const value = parseFloat(condition.value as any)
    const diff = value * 0.1
    let valid: boolean = true
    let aNumber = activity[prop]

    // If target is an array, use its length instead.
    if (_.isArray(aNumber)) {
        aNumber = aNumber.length
    }

    // No valid number set? Stop here.
    if (_.isNil(aNumber)) {
        return false
    }

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
        logger.debug("Recipes.checkNumber", `Activity ${activity.id}`, condition, "Failed")
    }

    return valid
}

/**
 * Check if the passed boolean condition is valid.
 * @param activity The Strava activity to be checked.
 * @param condition The boolean recipe condition.
 */
export const checkBoolean = (activity: StravaActivity, condition: RecipeCondition): boolean => {
    const prop = condition.property
    const valid: boolean = (!activity[prop] && condition.value === false) || activity[prop] === condition.value

    if (!valid) {
        logger.debug("Recipes.checkBoolean", `Activity ${activity.id}`, condition, "Failed")
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
    const value: string = condition.value.toString().toLowerCase()
    const aText: string = activity[prop].toString().toLowerCase()
    let valid: boolean = true

    if (op == RecipeOperator.Equal && aText != value) {
        valid = false
    } else if (op == RecipeOperator.Like && !aText.includes(value)) {
        valid = false
    } else if (op == RecipeOperator.NotLike && aText.includes(value)) {
        valid = false
    } else if (op == RecipeOperator.GreaterThan || op == RecipeOperator.LessThan) {
        throw new Error(`Invalid operator ${op} for ${prop}`)
    }

    if (!valid) {
        logger.debug("Recipes.checkText", `Activity ${activity.id}`, condition, "Failed")
    }

    return valid
}

/**
 * Check if weather for activity matches the specified condition.
 * @param user User data.
 * @param activity The Strava activity to be checked.
 * @param condition The weather based recipe condition.
 */
export const checkWeather = async (user: UserData, activity: StravaActivity, condition: RecipeCondition): Promise<boolean> => {
    const prop = condition.property
    const op = condition.operator

    // If activity has no valid location data, stop right here.
    if (!activity.hasLocation) {
        logger.debug("Recipes.checkWeather", `Activity ${activity.id}`, condition, "Activity has no location data")
        return false
    }

    try {
        let valid: boolean = false

        // Parse condition value and weather property.
        const value = parseInt(condition.value as string)
        const diff = value * 0.1
        const weatherProp = prop.split(".")[1]

        // Get activity weather.
        const weatherSummary = await weather.getActivityWeather(user, activity)
        let summary: WeatherSummary

        // Weather could not be fetched? Stop here.
        if (!weatherSummary) {
            logger.debug("Recipes.checkWeather", `Activity ${activity.id}`, condition, "Failed to fetch weather")
            return false
        }

        // Check for weather on start and end of the activity.
        for (summary of [weatherSummary.start, weatherSummary.end]) {
            if (!summary || _.isNil(summary[weatherProp])) {
                continue
            }

            let weatherPropValue = summary[weatherProp].replace(/[^\d.-]/g, "")
            if (!isNaN(weatherPropValue)) weatherPropValue = parseFloat(weatherPropValue)

            if (op == RecipeOperator.Equal) {
                valid = valid || weatherPropValue == value
            } else if (op == RecipeOperator.Like) {
                valid = value < weatherPropValue + diff && value > weatherPropValue - diff
            } else if (op == RecipeOperator.GreaterThan) {
                valid = valid || weatherPropValue > value
            } else if (op == RecipeOperator.LessThan) {
                valid = valid || weatherPropValue < value
            } else {
                throw new Error(`Invalid operator ${op} for ${prop}`)
            }
        }

        if (!valid) {
            logger.debug("Recipes.checkWeather", `Activity ${activity.id}`, condition, "Failed")
        }

        return valid
    } catch (ex) {
        logger.error("Recipes.checkWeather", `Activity ${activity.id}`, condition, ex)
        return false
    }
}

/**
 * Check if a spotify track during the the activity matches the specified condition.
 * @param user User data.
 * @param activity The Strava activity to be checked.
 * @param condition The Spotify based recipe condition.
 */
export const checkSpotify = async (user: UserData, activity: StravaActivity, condition: RecipeCondition): Promise<boolean> => {
    const prop = condition.property
    const op = condition.operator

    // If user has no Spotify account linked, stop here.
    if (!user.spotify) {
        logger.debug("Recipes.checkSpotify", `Activity ${activity.id}`, condition, "Skipped, user has no Spotify")
        return false
    }

    try {
        let valid: boolean = false

        // Validated already if user has no Spotify and condition is "not like".
        if (!user.spotify && op == RecipeOperator.NotLike) {
            valid = true
        } else {
            const trackName = condition.value ? condition.value.toString().toLowerCase() : ""

            // Fetch recent played tracks from Spotify.
            const tracks = (await spotify.getActivityTracks(user, activity)) || []
            const trackTitles = tracks.map((t) => t.title.toLowerCase())

            // Set as valid if user has tracks and either no specific track name was set,
            // or a track name was set and it matches one of the played tracks.
            if (tracks.length > 0) {
                if (op == RecipeOperator.Equal) {
                    valid = trackTitles.filter((t) => t == trackName).length > 0
                } else if (op == RecipeOperator.Like) {
                    valid = trackTitles.join(" | ").includes(trackName)
                } else if (op == RecipeOperator.NotLike) {
                    valid = !trackTitles.join(" | ").includes(trackName)
                } else {
                    throw new Error(`Invalid operator ${op} for ${prop}`)
                }
            } else if (op == RecipeOperator.NotLike) {
                valid = true
            }
        }

        if (!valid) {
            logger.debug("Recipes.checkSpotify", `Activity ${activity.id}`, condition, "Failed")
        }

        return valid
    } catch (ex) {
        logger.error("Recipes.checkSpotify", `Activity ${activity.id}`, condition, ex)
        return false
    }
}

/**
 * Check if the activity is today's first for the user.
 * @param user User data.
 * @param activity The Strava activity to be checked.
 * @param condition The recipe condition.
 * @param sameSport Only applies to the same sport as the passed activity?
 */
export const checkFirstOfDay = async (user: UserData, activity: StravaActivity, condition: RecipeCondition, sameSport: boolean): Promise<boolean> => {
    const sameLog = sameSport ? "Same sport" : "Any sport"
    const prop = condition.property
    const op = condition.operator
    const value = condition.value as boolean

    try {
        if (op != RecipeOperator.Equal) {
            throw new Error(`Invalid operator ${op} for ${prop}`)
        }

        const now = dayjs()
        const lastActivityDate = dayjs(user.dateLastActivity || user.dateRegistered).utc()
        const activityDate = dayjs(activity.dateStart).utc()
        let isFirst = activityDate.dayOfYear() > lastActivityDate.dayOfYear() || activityDate.year() > lastActivityDate.year()
        let valid: boolean = false

        // Processing an older activity, or filtering by same sport?
        // Fetch activities for the same date to check if it's the first one.
        if (!isFirst && (sameSport || lastActivityDate.isAfter(activityDate))) {
            const query: any = {after: activityDate.startOf("day").valueOf() / 1000}
            if (now.dayOfYear() != activityDate.dayOfYear()) {
                query.before = activityDate.endOf("day").valueOf() / 1000
            }

            const dayActivities = await strava.activities.getActivities(user, query)
            const filteredActivities = sameSport ? _.filter(dayActivities, {sportType: activity.sportType}) : dayActivities
            const activities = _.sortBy(filteredActivities, "dateStart")

            if (activities.length == 0 || activities[0].id == activity.id) {
                isFirst = true
            }
        }

        valid = (isFirst && value) || (!isFirst && !value)

        if (!valid) {
            logger.debug("Recipes.checkFirstOfDay", `Activity ${activity.id}`, condition, sameLog, "Failed")
        }

        return valid
    } catch (ex) {
        logger.error("Recipes.checkFirstOfDay", `Activity ${activity.id}`, condition, sameLog, ex)
        return false
    }
}
