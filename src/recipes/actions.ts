// Strautomator Core: Recipe Action methods

import {recipePropertyList} from "./lists"
import {RecipeAction, RecipeActionType, RecipeData} from "./types"
import {StravaActivity, StravaGear} from "../strava/types"
import {UserData} from "../users/types"
import {axiosRequest} from "../axios"
import mailer from "../mailer"
import weather from "../weather"
import _ = require("lodash")
import jaul = require("jaul")
import logger = require("anyhow")
import moment = require("moment")
const settings = require("setmeup").settings

/**
 * Helper to log and alert users about failed actions.
 */
const failedAction = (user: UserData, activity: StravaActivity, recipe: RecipeData, action: RecipeAction, error: any): void => {
    logger.error("Recipes.failedAction", `User ${user.id} ${user.displayName}`, `Activity ${activity.id}`, `${recipe.id} - ${action.type}`, error)

    // If user has an email set, alert about the issue.
    if (user.email) {
        const options = {
            to: user.email,
            template: "RecipeFailedAction",
            data: {
                userId: user.id,
                recipeId: recipe.id,
                recipeTitle: recipe.title,
                activityId: activity.id,
                activityDate: moment(activity.dateStart).format("ll"),
                action: action.friendlyValue,
                errorMessage: error.message ? error.message : error.toString()
            }
        }

        // Send email notification to user (do not wait, as this is not considered critical).
        mailer.send(options)
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
        const activityWithSuffix: StravaActivity = _.cloneDeep(activity)
        for (let prop of recipePropertyList) {
            if (prop.suffix && activityWithSuffix[prop.value]) {
                activityWithSuffix[prop.value] = `${activityWithSuffix[prop.value]}${prop.suffix}`
            }
        }

        // Iterate activity properties and replace keywords set on the action value.
        processedValue = jaul.data.replaceTags(processedValue, activityWithSuffix)

        // Weather tags on the value? Fetch weather and process it, but only if activity has a location set.
        if (processedValue.indexOf("${weather.") >= 0) {
            if (activity.locationStart && activity.locationStart.length > 0) {
                const weatherSummary = await weather.getActivityWeather(activity, user.preferences)

                if (weatherSummary) {
                    const weatherDetails = weatherSummary.end || weatherSummary.start
                    processedValue = jaul.data.replaceTags(processedValue, weatherDetails, "weather.")
                } else {
                    processedValue = jaul.data.replaceTags(processedValue, weather.emptySummary, "weather.")
                }
            } else {
                logger.warn("Recipes.defaultAction", `User ${user.id} ${user.displayName}`, `Activity ${activity.id}`, "Weather tags on recipe, but no location data on activity")
                processedValue = jaul.data.replaceTags(processedValue, weather.emptySummary, "weather.")
            }
        }

        // Set the activity name?
        if (action.type == RecipeActionType.Name) {
            activity.name = processedValue
            activity.updatedFields.push("name")
        }
        // Append to the activity name?
        else if (action.type == RecipeActionType.AppendName) {
            activity.name += " " + processedValue
            activity.updatedFields.push("name")
        }
        // Set the activity description?
        else if (action.type == RecipeActionType.Description) {
            activity.description = processedValue
            activity.updatedFields.push("description")
        }
        // Append to the activity description?
        else if (action.type == RecipeActionType.AppendDescription) {
            if (!activity.description) activity.description = ""
            activity.description += " " + processedValue
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
        let gear: StravaGear

        if (activity.type == "Ride" || activity.type == "VirtualRide" || activity.type == "EBikeRide") {
            gear = _.find(user.profile.bikes, {id: action.value})
        } else {
            gear = _.find(user.profile.shoes, {id: action.value})
        }

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
