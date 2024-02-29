// Strautomator Core: Recipe Condition checks

import {recipePropertyList} from "./lists"
import {RecipeCondition, RecipeOperator} from "./types"
import {GarminActivity} from "../garmin/types"
import {StravaActivity, StravaActivityQuery} from "../strava/types"
import {UserData} from "../users/types"
import {WeatherSummary} from "../weather/types"
import garmin from "../garmin"
import spotify from "../spotify"
import strava from "../strava"
import weather from "../weather"
import _ from "lodash"
import jaul from "jaul"
import logger from "anyhow"
import * as logHelper from "../loghelper"
import dayjs from "../dayjs"
import polyline = require("@mapbox/polyline")
const settings = require("setmeup").settings

/**
 * Check if the passed text / string based condition is valid.
 * This is the the "default" condition.
 * @param activity The Strava activity to be checked.
 * @param condition The text / string based recipe condition.
 * @param garminActivity Optional, check values from a Garmin activity instead.
 */
export const checkText = (activity: StravaActivity, condition: RecipeCondition, garminActivity?: GarminActivity): boolean => {
    const prop = condition.property
    const op = condition.operator
    let valid = false

    // Activity field has no value? Stop here.
    let refText = !garminActivity ? activity[prop] : garminActivity[prop.replace("garmin.", "")]
    if (_.isNil(refText)) {
        return false
    }

    // Property and parsed condition value.
    const aText: string = refText.toString().toLowerCase()
    const value: string = condition.value.toString().toLowerCase()

    // Check text.
    if (op == RecipeOperator.Equal && aText == value) {
        valid = true
    } else if (op == RecipeOperator.Like && aText.includes(value)) {
        valid = true
    } else if (op == RecipeOperator.NotLike && !aText.includes(value)) {
        valid = true
    }

    if (valid) {
        return true
    }

    logger.debug("Recipes.checkText", logHelper.activity(activity), condition, "Failed")
    return false
}

/**
 * Check if the passed boolean condition is valid.
 * @param activity The Strava activity to be checked.
 * @param condition The boolean recipe condition.
 */
export const checkBoolean = (activity: StravaActivity, condition: RecipeCondition): boolean => {
    const prop = condition.property
    const valid = (!activity[prop] && condition.value === false) || activity[prop] === condition.value

    if (valid) {
        return true
    }

    logger.debug("Recipes.checkBoolean", logHelper.activity(activity), condition, "Failed")
    return valid
}

/**
 * Check if the passed number based condition is valid.
 * @param activity The Strava (or Garmin) activity to be checked.
 * @param condition The number based recipe condition.
 * @param garminActivity Optional, check values from a Garmin activity instead.
 */
export const checkNumber = (activity: StravaActivity, condition: RecipeCondition, garminActivity?: GarminActivity): boolean => {
    const prop = condition.property
    const op = condition.operator
    let valid = false

    // If a Garmin activity was passed, use its values instead.
    // If target is an array, use its length as the target value.
    let aNumber = !garminActivity ? activity[prop] : garminActivity[prop.replace("garmin.", "")]
    if (_.isArray(aNumber)) {
        aNumber = aNumber.length
    }

    // Activity field has no value? Stop here.
    if (_.isNil(aNumber)) {
        return false
    }

    // Parsed condition value.
    const value = parseFloat(condition.value as string)

    // Check number.
    if (op == RecipeOperator.Equal) {
        valid = aNumber.toFixed(1) == value.toFixed(1)
    } else if (op == RecipeOperator.NotEqual) {
        valid = aNumber.toFixed(1) != value.toFixed(1)
    } else if (op == RecipeOperator.Approximate) {
        const diff = value * 0.03
        valid = value <= aNumber + diff && value >= aNumber - diff
    } else if (op == RecipeOperator.Like) {
        const diff = value * 0.1
        valid = value <= aNumber + diff && value >= aNumber - diff
    } else if (op == RecipeOperator.LessThan) {
        valid = aNumber < value
    } else if (op == RecipeOperator.GreaterThan) {
        valid = aNumber > value
    }

    if (valid) {
        return true
    }

    logger.debug("Recipes.checkNumber", logHelper.activity(activity), condition, "Failed")
    return false
}

/**
 * Check if the activity starts, passes on or ends on the specified location.
 * @param activity The Strava activity to be checked.
 * @param condition The location based recipe condition.
 */
export const checkLocation = (activity: StravaActivity, condition: RecipeCondition): boolean => {
    const prop = condition.property
    const op = condition.operator

    // Activity location field has no value? Stop here.
    if (_.isNil(activity[prop])) {
        return false
    }

    // Checking for a point in the activity polyline, or for a single lat / long?
    let coordinates: [number[]] = prop == "polyline" ? polyline.decode(activity.polyline) : [[activity[prop][0], activity[prop][1]]]

    // When using "equals" use around 60m radius, and "like" use 650m radius.
    let radius: number
    if (op == RecipeOperator.Equal || op == RecipeOperator.NotEqual) {
        radius = 0.000556
    } else if (op == RecipeOperator.Approximate) {
        radius = 0.002735
    } else if (op == RecipeOperator.Like) {
        radius = 0.005926
    }

    // Parsed coordinates from condition value.
    const arr = condition.value.toString().split(",")
    const cLat = parseFloat(arr[0])
    const cLong = parseFloat(arr[1])

    // Check if activity passed near the specified location.
    for (let [lat, long] of coordinates) {
        if (op == RecipeOperator.NotEqual && (lat <= cLat - radius || lat >= cLat + radius || long <= cLong - radius || long >= cLong + radius)) {
            return true
        }
        if (op != RecipeOperator.NotEqual && lat <= cLat + radius && lat >= cLat - radius && long <= cLong + radius && long >= cLong - radius) {
            return true
        }
    }

    logger.debug("Recipes.checkLocation", logHelper.activity(activity), condition, "Failed")
    return false
}

/**
 * Check if the passed timestamp based condition is valid.
 * @param activity The Strava activity to be checked.
 * @param condition The timestamp based recipe condition.
 */
export const checkTimestamp = (activity: StravaActivity, condition: RecipeCondition): boolean => {
    const prop = condition.property
    const op = condition.operator
    let valid = false

    // Activity field has no value? Stop here.
    if (_.isNil(activity[prop])) {
        return false
    }

    let aTime = 0
    let isPace = prop.indexOf("pace") == 0
    let isTime = prop.includes("Time")

    // Pace and time based comparisons have different operator values.
    const eqBuffer = isPace ? 1 : 60
    const approxBuffer = isPace ? 20 : 600
    const likeBuffer = isPace ? 60 : 1800

    // Parse activity as pace, time (duration) or full datetime.
    if (isPace || isTime) {
        aTime = activity[prop]
    } else {
        let aDate = dayjs.utc(activity[prop])
        if (activity.utcStartOffset) {
            aDate = aDate.add(activity.utcStartOffset, "minutes")
        }

        aTime = aDate.second() + aDate.minute() * 60 + aDate.hour() * 3600
    }

    // Parsed timestamp as integer.
    const value = parseInt(condition.value as string)

    // Check it time matches the condition's operator / buffer time.
    if (op == RecipeOperator.Equal) {
        valid = aTime >= value - eqBuffer && aTime <= value + eqBuffer
    } else if (op == RecipeOperator.Approximate) {
        valid = aTime >= value - approxBuffer && aTime <= value + approxBuffer
    } else if (op == RecipeOperator.Like) {
        valid = aTime >= value - likeBuffer && aTime <= value + likeBuffer
    } else if (op == RecipeOperator.LessThan) {
        valid = aTime < value
    } else if (op == RecipeOperator.GreaterThan) {
        valid = aTime > value
    }

    if (valid) {
        return true
    }

    logger.debug("Recipes.checkTimestamp", logHelper.activity(activity), condition, "Failed")
    return false
}

/**
 * Check if the passed activity is of a type for a sport defined on the condition.
 * @param activity The Strava activity to be checked.
 * @param condition The sport type recipe condition.
 */
export const checkSportType = (activity: StravaActivity, condition: RecipeCondition): boolean => {
    const op = condition.operator
    let valid = false

    // Sport and parsed condition value.
    const sportType = activity.sportType?.toString() || ""
    const arrValue = condition.value.toString().split(",")

    // Check sport type.
    if (op == RecipeOperator.Equal) {
        valid = arrValue.includes(sportType)
    } else if (op == RecipeOperator.NotEqual) {
        valid = !sportType || !arrValue.includes(sportType)
    }

    if (valid) {
        return true
    }

    logger.debug("Recipes.checkSportType", logHelper.activity(activity), condition, "Failed")
    return false
}

/**
 * Check if the passed activity was made with the specified gear.
 * @param activity The Strava activity to be checked.
 * @param condition The gear recipe condition.
 */
export const checkGear = (activity: StravaActivity, condition: RecipeCondition): boolean => {
    const op = condition.operator
    let valid = false

    // Gear and parsed condition value.
    const gear = activity.gear ? activity.gear.id : ""
    const arrValue = condition.value.toString().split(",")

    // Check gear.
    if (op == RecipeOperator.Equal) {
        valid = arrValue.includes(gear)
    } else if (op == RecipeOperator.NotEqual) {
        valid = !gear || !arrValue.includes(gear)
    }

    if (valid) {
        return true
    }

    logger.debug("Recipes.checkGear", logHelper.activity(activity), condition, "Failed")
    return false
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

    // Check new records.
    if (condition.value === true ? yes : no) {
        return true
    }

    logger.debug("Recipes.checkNewRecords", logHelper.activity(activity), condition, "Failed")
    return false
}

/**
 * Check if the passed date is on the specified week day (0 = Sunday, 6 = Saturday).
 * @param activity The Strava activity to be checked.
 * @param condition The weekday based recipe condition.
 */
export const checkWeekday = (activity: StravaActivity, condition: RecipeCondition): boolean => {
    const op = condition.operator
    let valid = false

    // No valid start date? Stop here.
    if (!activity.dateStart) {
        return false
    }

    // Activity start date.
    let aDate = dayjs.utc(activity["dateStart"])
    if (activity.utcStartOffset) {
        aDate = aDate.add(activity.utcStartOffset, "minutes")
    }

    // Weekday and parsed condition value.
    const weekday = aDate.day().toString()
    const arrValue = condition.value.toString().split(",")

    // Check weekday.
    if (op == RecipeOperator.Equal) {
        valid = arrValue.includes(weekday)
    } else if (op == RecipeOperator.NotEqual) {
        valid = !arrValue.includes(weekday)
    }

    if (valid) {
        return true
    }

    logger.debug("Recipes.checkWeekday", logHelper.activity(activity), condition, "Failed")
    return false
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
    let valid = false

    // If activity has no valid location data, stop right here.
    if (!activity.hasLocation) {
        logger.debug("Recipes.checkWeather", logHelper.activity(activity), condition, "Activity has no location data")
        return false
    }

    // Get activity weather.
    const weatherProp = prop.split(".")[1]
    const aqiNeeded = weatherProp == "aqi"
    const weatherSummary = await weather.getActivityWeather(user, activity, aqiNeeded)

    // Weather could not be fetched? Stop here.
    if (!weatherSummary) {
        logger.debug("Recipes.checkWeather", logHelper.activity(activity), condition, "Failed to fetch weather")
        return false
    }

    // Parsed condition value as number.
    const value = parseInt(condition.value as string)
    let summary: WeatherSummary

    // Check for weather on start and end of the activity.
    for (summary of [weatherSummary.start, weatherSummary.end]) {
        if (!summary || _.isNil(summary[weatherProp])) {
            continue
        }

        let weatherPropValue = summary[weatherProp]?.toString().replace(/[^\d.-]/g, "") || ""
        if (!isNaN(weatherPropValue)) {
            weatherPropValue = parseFloat(weatherPropValue)
        }

        if (op == RecipeOperator.Equal) {
            valid = valid || weatherPropValue == value
        } else if (op == RecipeOperator.Approximate) {
            const diff = value * 0.03
            valid = value <= weatherPropValue + diff && value >= weatherPropValue - diff
        } else if (op == RecipeOperator.Like) {
            const diff = value * 0.1
            valid = value <= weatherPropValue + diff && value >= weatherPropValue - diff
        } else if (op == RecipeOperator.LessThan) {
            valid = valid || weatherPropValue < value
        } else if (op == RecipeOperator.GreaterThan) {
            valid = valid || weatherPropValue > value
        }
    }

    if (valid) {
        return true
    }

    logger.debug("Recipes.checkWeather", logHelper.activity(activity), condition, "Failed")
    return false
}

/**
 * Check if Garmin related metadata matches the activity.
 * @param user User data.
 * @param activity The Strava activity to be checked.
 * @param condition The Garmin based recipe condition.
 */
export const checkGarmin = async (user: UserData, activity: StravaActivity, condition: RecipeCondition): Promise<boolean> => {
    const op = condition.operator
    let valid = false

    // If user has no Garmin account linked, stop here.
    if (!user.isPro || !user.garmin) {
        logger.debug("Recipes.checkGarmin", logHelper.activity(activity), condition, "Skipped, user has no Garmin profile")
        return op == RecipeOperator.NotEqual || op == RecipeOperator.NotLike
    }

    // Try finding the matching Garmin activity for the Strava activity.
    // If failed and the activity was recorded with a Garmin device, try again in a few seconds.
    let garminActivity = await garmin.activities.getMatchingActivity(user, activity)
    if (!garminActivity) {
        if (activity.device?.includes("Garmin")) {
            await jaul.io.sleep(settings.garmin.delaySeconds)
            garminActivity = await garmin.activities.getMatchingActivity(user, activity)
        }
        if (!garminActivity) {
            return op == RecipeOperator.NotLike
        }
    }

    // Finally check the corresponding field on the Garmin activity.
    const field = condition.property.split(".")[1]
    if (field == "sensor") {
        const hasDevice = garminActivity.devices?.find((d) => d.includes(condition.value as string)) ? true : false
        valid = (op == RecipeOperator.Equal && hasDevice) || (op == RecipeOperator.NotEqual && !hasDevice)
    } else {
        const propType = recipePropertyList.find((p) => p.value == condition.property).type

        // Proxy text and number validators.
        if (propType == "string") {
            valid = checkText(activity, condition, garminActivity)
        } else if (propType == "number") {
            valid = checkNumber(activity, condition, garminActivity)
        }
    }

    if (valid) {
        return true
    }

    logger.debug("Recipes.checkGarmin", logHelper.activity(activity), condition, "Failed")
    return false
}

/**
 * Check if a spotify track during the the activity matches the specified condition.
 * @param user User data.
 * @param activity The Strava activity to be checked.
 * @param condition The Spotify based recipe condition.
 */
export const checkSpotify = async (user: UserData, activity: StravaActivity, condition: RecipeCondition): Promise<boolean> => {
    const op = condition.operator
    let valid = false

    // If user has no Spotify account linked, stop here.
    if (!user.spotify) {
        logger.debug("Recipes.checkSpotify", logHelper.activity(activity), condition, "Skipped, user has no Spotify profile")
        return op == RecipeOperator.NotEqual || op == RecipeOperator.NotLike
    }

    // Fetch recent played tracks from Spotify.
    const tracks = (await spotify.getActivityTracks(user, activity)) || []
    const trackTitles = tracks.map((t) => t.title.toLowerCase())
    const value = condition.value.toString().toLowerCase() || ""

    // Check Spotify.
    // Set as valid if user has tracks and either no specific track name was set,
    // or a track name was set and it matches one of the played tracks.

    if (tracks.length > 0) {
        if (op == RecipeOperator.Equal) {
            valid = trackTitles.filter((t) => t == value).length > 0
        } else if (op == RecipeOperator.Like) {
            valid = trackTitles.filter((t) => t.includes(t)).length > 0
        } else if (op == RecipeOperator.NotLike) {
            valid = trackTitles.filter((t) => !t.includes(t)).length > 0
        }
    } else if (op == RecipeOperator.NotLike) {
        valid = true
    }

    if (valid) {
        return true
    }

    logger.debug("Recipes.checkSpotify", logHelper.activity(activity), condition, "Failed")
    return false
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
    const op = condition.operator
    const value = condition.value as boolean

    let now = dayjs().utc()
    let activityDate = dayjs(activity.dateStart).utc()
    let lastActivityDate = dayjs(user.dateLastActivity || user.dateRegistered).utc()

    // Consider the activity timezone when calculating the dates.
    if (activity.utcStartOffset) {
        now = now.add(activity.utcStartOffset, "minutes")
        activityDate = activityDate.add(activity.utcStartOffset, "minutes")
        lastActivityDate = lastActivityDate.add(activity.utcStartOffset, "minutes")
    }

    let isFirst = activityDate.dayOfYear() > lastActivityDate.dayOfYear() || activityDate.year() > lastActivityDate.year()
    let valid = false

    // Processing an older activity, or filtering by same sport?
    // Fetch activities for the same date to check if it's the first one.
    if (!isFirst && (sameSport || lastActivityDate.isAfter(activityDate))) {
        const query: StravaActivityQuery = {after: activityDate.startOf("day")}
        if (now.dayOfYear() != activityDate.dayOfYear()) {
            query.before = activityDate.endOf("day")
        }

        const dayActivities = await strava.activities.getActivities(user, query)
        const filteredActivities = sameSport ? _.filter(dayActivities, {sportType: activity.sportType}) : dayActivities
        const activities = _.sortBy(filteredActivities, "dateStart")

        if (activities.length == 0 || activities[0].id == activity.id) {
            isFirst = true
        }
    }

    if (op == RecipeOperator.Equal) {
        valid = isFirst && value
    } else if (op == RecipeOperator.NotEqual) {
        valid = !isFirst && !value
    }

    if (valid) {
        return true
    }

    logger.debug("Recipes.checkFirstOfDay", logHelper.activity(activity), condition, sameLog, "Failed")
    return false
}
