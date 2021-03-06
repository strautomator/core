// Strautomator Core: Recipe Action methods

import {recipePropertyList, recipeActionList} from "./lists"
import {RecipeAction, RecipeActionType, RecipeData, RecipeStatsData} from "./types"
import {StravaActivity, StravaGear} from "../strava/types"
import {UserData} from "../users/types"
import {axiosRequest} from "../axios"
import recipeStats from "./stats"
import notifications from "../notifications"
import weather from "../weather"
import _ = require("lodash")
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
export const defaultAction = async (user: UserData, activity: StravaActivity, recipe: RecipeData, action: RecipeAction): Promise<void> => {
    try {
        let processedValue = action.value

        // Append suffixes to values before processing.
        const activityWithSuffix: any = _.cloneDeep(activity)
        for (let prop of recipePropertyList) {
            let suffix = user.profile.units == "imperial" && prop.impSuffix ? prop.impSuffix : prop.suffix
            if (prop.fSuffix && user.preferences && user.preferences.weatherUnit == "f") suffix = prop.fSuffix

            if (suffix && !_.isNil(activityWithSuffix[prop.value]) && !_.isDate(activityWithSuffix[prop.value])) {
                activityWithSuffix[prop.value] = `${activityWithSuffix[prop.value]}${suffix}`
            }
        }

        // Value has a counter tag? Get recipe stats to increment the counter.
        if (processedValue.indexOf("${counter}") >= 0) {
            const stats: RecipeStatsData = (await recipeStats.getStats(user, recipe)) as RecipeStatsData
            activityWithSuffix.counter = stats && stats.counter ? stats.counter + 1 : 1
        }

        // Weather tags on the value? Fetch weather and process it, but only if activity has a location set.
        if (processedValue.indexOf("${weather.") >= 0) {
            const hasStart = activity.locationStart && activity.locationStart.length > 0
            const hasEnd = activity.locationEnd && activity.locationEnd.length > 0

            if (hasStart || hasEnd) {
                const weatherSummary = await weather.getActivityWeather(activity, user.preferences)

                if (weatherSummary) {
                    const weatherDetails = weatherSummary.end && weatherSummary.end.icon ? weatherSummary.end : weatherSummary.start
                    processedValue = jaul.data.replaceTags(processedValue, weatherDetails, "weather.")
                } else {
                    processedValue = jaul.data.replaceTags(processedValue, weather.emptySummary, "weather.")
                }

                if (processedValue == "") {
                    logger.warn("Recipes.defaultAction.weather", `User ${user.id} ${user.displayName}`, `Activity ${activity.id}`, `Recipe ${recipe.id}`, "Got no valid activity weather")
                }
            } else {
                logger.warn("Recipes.defaultAction.weather", `User ${user.id} ${user.displayName}`, `Activity ${activity.id}`, `Recipe ${recipe.id}`, "No location data on activity")
                processedValue = jaul.data.replaceTags(processedValue, weather.emptySummary, "weather.")
            }
        }

        // Iterate activity properties and replace keywords set on the action value.
        processedValue = jaul.data.replaceTags(processedValue, activityWithSuffix)

        // Empty value? Stop here.
        if (processedValue === null || processedValue.toString().trim() === "") {
            logger.warn("Recipes.defaultAction", `User ${user.id} ${user.displayName}`, `Activity ${activity.id}`, "Processed action value is empty")
            return
        }

        // Set the activity name?
        if (action.type == RecipeActionType.Name) {
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
    } catch (ex) {
        failedAction(user, activity, recipe, action, ex)
    }
}

/**
 * Set an activity as commute or not.
 * @param user The activity owner.
 * @param activity The Strava activity details.
 * @param recipe The source recipe.
 * @param action The action details.
 */
export const commuteAction = async (user: UserData, activity: StravaActivity, recipe: RecipeData, action: RecipeAction): Promise<void> => {
    try {
        activity.commute = action.value === false ? false : true
        activity.updatedFields.push("commute")
    } catch (ex) {
        failedAction(user, activity, recipe, action, ex)
    }
}

/**
 * Set an activity's gear.
 * @param user The activity owner.
 * @param activity The Strava activity details.
 * @param recipe The source recipe.
 * @param action The action details.
 */
export const gearAction = async (user: UserData, activity: StravaActivity, recipe: RecipeData, action: RecipeAction): Promise<void> => {
    try {
        const getGear = (): StravaGear => {
            if (activity.type == "Ride" || activity.type == "VirtualRide" || activity.type == "EBikeRide") {
                return _.find(user.profile.bikes, {id: action.value})
            } else {
                return _.find(user.profile.shoes, {id: action.value})
            }
        }

        let gear: StravaGear = getGear()

        if (!gear) {
            throw new Error(`Gear ID ${action.value} not found`)
        } else {
            activity.gear = gear
            activity.updatedFields.push("gear")
        }
    } catch (ex) {
        failedAction(user, activity, recipe, action, ex)
    }
}

/**
 * Dispatch activity and data via a webhook URL.
 * @param user The activity owner.
 * @param activity The Strava activity details.
 * @param recipe The source recipe.
 * @param action The action details.
 */
export const webhookAction = async (user: UserData, activity: StravaActivity, recipe: RecipeData, action: RecipeAction): Promise<void> => {
    try {
        const options = {
            method: "POST",
            url: action.value,
            timeout: settings.recipes.webhook.timeout,
            data: activity
        }

        await axiosRequest(options)
    } catch (ex) {
        failedAction(user, activity, recipe, action, ex)
    }
}
