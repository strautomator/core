// Strautomator Core: Recipe Action methods

import {RecipeAction, RecipeActionType, RecipeData, RecipeMusicTags, RecipeStatsData} from "./types"
import {recipeActionList} from "./lists"
import {transformActivityFields} from "../strava/utils"
import {StravaActivity, StravaGear} from "../strava/types"
import {UserData} from "../users/types"
import {axiosRequest} from "../axios"
import {getActivityFortune} from "../fortune"
import recipeStats from "./stats"
import maps from "../maps"
import musixmatch from "../musixmatch"
import notifications from "../notifications"
import spotify from "../spotify"
import weather from "../weather"
import _ from "lodash"
import jaul = require("jaul")
import logger = require("anyhow")
const settings = require("setmeup").settings

/**
 * Helper to log and alert users about failed actions.
 */
const failedAction = async (user: UserData, activity: StravaActivity, recipe: RecipeData, action: RecipeAction, error: any): Promise<void> => {
    logger.error("Recipes.failedAction", `User ${user.id} ${user.displayName}`, `Activity ${activity.id}`, `${recipe.id} - ${action.type}`, error)

    try {
        const errorMessage = error.message || error.description || error
        const actionType = _.find(recipeActionList, {value: action.type}).text
        const actionValue = action.friendlyValue || action.value
        const body = `There was an issue processing the activity ID ${activity.id}. Action: ${actionType} - ${actionValue}. ${errorMessage.toString()}`
        const title = `Failed automation: ${recipe.title}`

        // Create a notification to the user statin the failed action.
        const notification = {userId: user.id, title: title, body: body, recipeId: recipe.id, activityId: activity.id}
        await notifications.createNotification(user, notification)
    } catch (ex) {
        logger.error("Recipes.failedAction.exception", `User ${user.id} ${user.displayName}`, `Activity ${activity.id}`, `${recipe.id} - ${action.type}`, ex)
    }
}

/**
 * Default action to change an activity's property (name or description).
 * @param user The activity owner.
 * @param activity The Strava activity details.
 * @param recipe The source recipe.
 * @param action The action details.
 */
export const defaultAction = async (user: UserData, activity: StravaActivity, recipe: RecipeData, action: RecipeAction): Promise<boolean> => {
    try {
        let processedValue = action.value || ""
        let activityWithSuffix: StravaActivity = _.cloneDeep(activity)

        // Pre-process activity data and append suffixes to values before processing.
        transformActivityFields(user, activityWithSuffix)

        // Using the activity fortune?
        if (action.type == RecipeActionType.GenerateName) {
            processedValue = await getActivityFortune(user, activity)
        }

        // City tag(s) set? Trigger a reverse geocode for the specified coordinates, at the moment PRO users only.
        const hasCityStart = processedValue.includes("${cityStart}")
        const hasCityMid = processedValue.includes("${cityMid}")
        const hasCityEnd = processedValue.includes("${cityEnd}")
        if (user.isPro && (hasCityStart || hasCityMid || hasCityEnd)) {
            const cityObj = {cityStart: "", cityMid: "", cityEnd: ""}

            if (activity.hasLocation) {
                if (hasCityStart) {
                    try {
                        const address = await maps.getReverseGeocode(activity.locationStart, "locationiq")
                        cityObj.cityStart = address?.city ? address.city : ""
                    } catch (innerEx) {
                        logger.warn("Recipes.defaultAction", `User ${user.id} ${user.displayName}`, `Activity ${activity.id}`, recipe.id, "Failed to geocode the cityStart")
                    }
                }
                if (hasCityMid) {
                    try {
                        const address = await maps.getReverseGeocode(activity.locationMid, "locationiq")
                        cityObj.cityMid = address?.city ? address.city : ""
                    } catch (innerEx) {
                        logger.warn("Recipes.defaultAction", `User ${user.id} ${user.displayName}`, `Activity ${activity.id}`, recipe.id, "Failed to geocode the cityMid")
                    }
                }
                if (hasCityEnd) {
                    try {
                        const address = await maps.getReverseGeocode(activity.locationEnd, "locationiq")
                        cityObj.cityEnd = address?.city ? address.city : ""
                    } catch (innerEx) {
                        logger.warn("Recipes.defaultAction", `User ${user.id} ${user.displayName}`, `Activity ${activity.id}`, recipe.id, "Failed to geocode the cityEnd")
                    }
                }
            }

            processedValue = jaul.data.replaceTags(processedValue, {cityStart: cityObj.cityStart, hasCityMid: cityObj.cityMid, cityEnd: cityObj.cityEnd})
        }

        // Value has a counter tag? Get recipe stats to increment the counter.
        if (processedValue.includes("${counter}")) {
            const stats: RecipeStatsData = (await recipeStats.getStats(user, recipe)) as RecipeStatsData
            activityWithSuffix.counter = stats && stats.counter ? stats.counter + 1 : 1
        }

        // Weather tags on the value? Fetch weather and process it, but only if activity has a location set.
        if (processedValue.includes("${weather.")) {
            processedValue = await addWeatherTags(user, activity, recipe, processedValue)
        }

        // Music tags on the value? Fetch from Spotify if the user has an account linked.
        if (processedValue.includes("${spotify.")) {
            processedValue = await addSpotifyTags(user, activity, recipe, processedValue)
        }

        // Replace tags.
        if (processedValue) {
            processedValue = jaul.data.replaceTags(processedValue, activityWithSuffix)
        }

        // Empty value? Stop here.
        if (processedValue === null || processedValue.toString().trim() === "") {
            logger.warn("Recipes.defaultAction", `User ${user.id} ${user.displayName}`, `Activity ${activity.id}`, "Processed action value is empty")
            return true
        }

        // Set the activity name?
        if (action.type == RecipeActionType.Name || action.type == RecipeActionType.GenerateName) {
            activity.name = processedValue
            activity.updatedFields.push("name")
        }
        // Prepend to the activity name?
        else if (action.type == RecipeActionType.PrependName) {
            activity.name = `${processedValue} ${activity.name}`
            activity.updatedFields.push("name")
        }
        // Append to the activity name?
        else if (action.type == RecipeActionType.AppendName) {
            activity.name = `${activity.name} ${processedValue}`
            activity.updatedFields.push("name")
        }
        // Set the activity description?
        else if (action.type == RecipeActionType.Description) {
            activity.description = processedValue
            activity.updatedFields.push("description")
        }
        // Prepend to the activity description?
        else if (action.type == RecipeActionType.PrependDescription) {
            if (!activity.description) activity.description = processedValue
            else activity.description = `${processedValue} ${activity.description}`

            activity.updatedFields.push("description")
        }
        // Append to the activity description?
        else if (action.type == RecipeActionType.AppendDescription) {
            if (!activity.description) activity.description = processedValue
            else activity.description = `${activity.description} ${processedValue}`

            activity.updatedFields.push("description")
        }
        // Set the activity's private note?
        else if (action.type == RecipeActionType.PrivateNote) {
            activity.privateNote = processedValue
            activity.updatedFields.push("privateNote")
        }

        return true
    } catch (ex) {
        failedAction(user, activity, recipe, action, ex)
        return false
    }
}

/**
 * Default action to add weather tags to the activity name or description.
 * @param user The activity owner.
 * @param activity The Strava activity details.
 * @param recipe The source recipe.
 * @param processedValue The action's processed value.
 */
export const addWeatherTags = async (user: UserData, activity: StravaActivity, recipe: RecipeData, processedValue: string): Promise<string> => {
    try {
        const aqiNeeded = processedValue.includes("${weather.") && processedValue.includes(".aqi")
        const weatherSummary = await weather.getActivityWeather(user, activity, aqiNeeded)

        if (!weatherSummary) {
            logger.warn("Recipes.addWeatherTags", `User ${user.id} ${user.displayName}`, `Activity ${activity.id}`, `Recipe ${recipe.id}`, "Got no valid activity weather")
            processedValue = jaul.data.replaceTags(processedValue, "", "weather.start.")
            processedValue = jaul.data.replaceTags(processedValue, "", "weather.end.")
            processedValue = jaul.data.replaceTags(processedValue, "", "weather.")
            return processedValue
        }

        // Weather specific at the start.
        if (processedValue.includes("${weather.start.")) {
            processedValue = jaul.data.replaceTags(processedValue, weatherSummary.start || "", "weather.start.")
        }

        // Weather specific at the end.
        if (processedValue.includes("${weather.end.")) {
            processedValue = jaul.data.replaceTags(processedValue, weatherSummary.end || "", "weather.end.")
        }

        // More time during the day or during the night?
        if (processedValue.includes("${weather.")) {
            processedValue = jaul.data.replaceTags(processedValue, weatherSummary.mid || weatherSummary.end || weatherSummary.end || "", "weather.")
        }
    } catch (ex) {
        logger.warn("Recipes.addWeatherTags", `User ${user.id} ${user.displayName}`, `Activity ${activity.id}`, `Recipe ${recipe.id}`, ex)
    }

    return processedValue
}

/**
 * Default action to add music tags to the activity name or description.
 * @param user The activity owner.
 * @param activity The Strava activity details.
 * @param recipe The source recipe.
 * @param processedValue The action's processed value.
 */
export const addSpotifyTags = async (user: UserData, activity: StravaActivity, recipe: RecipeData, processedValue: string): Promise<string> => {
    try {
        const tracks = await spotify.getActivityTracks(user, activity)

        if (!tracks || tracks.length == 0) {
            logger.warn("Recipes.addSpotifyTags", `User ${user.id} ${user.displayName}`, `Activity ${activity.id}`, `Recipe ${recipe.id}`, "No Spotify tracks returned for the activity")
            processedValue = jaul.data.replaceTags(processedValue, "", "spotify.")
            return processedValue
        }

        const musicTags: RecipeMusicTags = {
            trackStart: tracks[0].title,
            trackEnd: tracks[tracks.length - 1].title,
            trackList: tracks.map((t) => t.title).join("\n") + "\n#spotify"
        }

        // Add lyrics (only available to PRO users).
        if (user.isPro) {
            if (processedValue.includes("spotify.lyricsStart")) {
                musicTags.lyricsStart = await musixmatch.getLyrics(tracks[0])
            }
            if (processedValue.includes("spotify.lyricsEnd")) {
                musicTags.lyricsEnd = await musixmatch.getLyrics(tracks[tracks.length - 1])
            }
        }

        processedValue = jaul.data.replaceTags(processedValue, musicTags, "spotify.")
    } catch (ex) {
        logger.warn("Recipes.addSpotifyTags", `User ${user.id} ${user.displayName}`, `Activity ${activity.id}`, `Recipe ${recipe.id}`, ex)
    }

    return processedValue
}

/**
 * Set a boolean property on the activity.
 * @param user The activity owner.
 * @param activity The Strava activity details.
 * @param recipe The source recipe.
 * @param action The action details.
 * @param field Field to be updated on the activity.
 */
export const booleanAction = async (user: UserData, activity: StravaActivity, recipe: RecipeData, action: RecipeAction): Promise<boolean> => {
    try {
        activity[action.type] = action.value === false ? false : true
        activity.updatedFields.push(action.type)

        return true
    } catch (ex) {
        failedAction(user, activity, recipe, action, ex)
        return false
    }
}

/**
 * Set the activity map style.
 * @param user The activity owner.
 * @param activity The Strava activity details.
 * @param recipe The source recipe.
 * @param action The action details.
 */
export const mapStyleAction = async (user: UserData, activity: StravaActivity, recipe: RecipeData, action: RecipeAction): Promise<boolean> => {
    try {
        activity.mapStyle = action.value
        activity.updatedFields.push("mapStyle")

        return true
    } catch (ex) {
        failedAction(user, activity, recipe, action, ex)
        return false
    }
}

/**
 * Set an activity's gear.
 * @param user The activity owner.
 * @param activity The Strava activity details.
 * @param recipe The source recipe.
 * @param action The action details.
 */
export const gearAction = async (user: UserData, activity: StravaActivity, recipe: RecipeData, action: RecipeAction): Promise<boolean> => {
    try {
        const isRide = activity.type == "Ride" || activity.type == "VirtualRide" || activity.type == "EBikeRide"
        const isRun = activity.type == "Run" || activity.type == "VirtualRun" || activity.type == "Walk"
        const bike = _.find(user.profile.bikes, {id: action.value})
        const shoe = _.find(user.profile.shoes, {id: action.value})
        const none: StravaGear = action.value === "none" ? {id: "none", name: "None"} : null
        const gear: StravaGear = bike || shoe || none

        // Make sure gear is valid for the correct activity type.
        if (!gear) {
            throw new Error(`Gear ID ${action.value} not found`)
        } else if ((isRide && shoe) || (isRun && bike)) {
            logger.info("Recipes.gearAction", `User ${user.id} ${user.displayName}`, `Activity ${activity.id}`, `Recipe ${recipe.id}`, `Gear ${action.value} not valid for type ${activity.type}`)
            return false
        } else {
            activity.gear = gear
            activity.updatedFields.push("gear")
        }

        return true
    } catch (ex) {
        failedAction(user, activity, recipe, action, ex)
        return false
    }
}

/**
 * Set the activity / sport type.
 * @param user The activity owner.
 * @param activity The Strava activity details.
 * @param recipe The source recipe.
 * @param action The action details.
 */
export const sportTypeAction = async (user: UserData, activity: StravaActivity, recipe: RecipeData, action: RecipeAction): Promise<boolean> => {
    try {
        const activityType = action.value
        activity.type = activityType
        activity.sportType = activityType
        activity.updatedFields.push("sportType")

        return true
    } catch (ex) {
        failedAction(user, activity, recipe, action, ex)
        return false
    }
}

/**
 * Set the activity workout type.
 * @param user The activity owner.
 * @param activity The Strava activity details.
 * @param recipe The source recipe.
 * @param action The action details.
 */
export const workoutTypeAction = async (user: UserData, activity: StravaActivity, recipe: RecipeData, action: RecipeAction): Promise<boolean> => {
    try {
        const isRide = activity.type == "Ride"
        const isRun = activity.type == "Run"
        let abortMessage: string

        // Avoid setting ride workout types to runs, and vice versa.
        if (!isRide && !isRun) {
            abortMessage = `Activity is not a ride or run, won't set workout type to ${action.value}`
        } else if (isRide && action.value < 10) {
            abortMessage = `Activity is not a ride, won't set workout type to ${action.value}`
        } else if (isRun && action.value >= 10) {
            abortMessage = `Activity is not a run, won't set workout type to ${action.value}`
        }

        if (abortMessage) {
            logger.info("Recipes.workoutTypeAction", `User ${user.id} ${user.displayName}`, `Activity ${activity.id}`, `Recipe ${recipe.id}`, abortMessage)
            return false
        }

        activity.workoutType = action.value
        activity.updatedFields.push("workoutType")

        return true
    } catch (ex) {
        failedAction(user, activity, recipe, action, ex)
        return false
    }
}

/**
 * Dispatch activity and data via a webhook URL.
 * @param user The activity owner.
 * @param activity The Strava activity details.
 * @param recipe The source recipe.
 * @param action The action details.
 */
export const webhookAction = async (user: UserData, activity: StravaActivity, recipe: RecipeData, action: RecipeAction): Promise<boolean> => {
    try {
        const options = {
            method: "POST",
            url: action.value,
            timeout: settings.recipes.webhook.timeout,
            data: activity
        }

        await axiosRequest(options)

        return true
    } catch (ex) {
        failedAction(user, activity, recipe, action, ex)
        return false
    }
}
