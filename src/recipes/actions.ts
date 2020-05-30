// Strautomator Core: Recipe Action methods

import {recipePropertyList} from "./lists"
import {RecipeAction, RecipeActionType} from "./types"
import {StravaActivity} from "../strava/types"
import {UserData} from "../users/types"
import weather from "../weather"
import _ = require("lodash")
import jaul = require("jaul")
import logger = require("anyhow")
const axios = require("axios").default
const settings = require("setmeup").settings
const packageVersion = require("../../package.json").version

/**
 * Default action to change an activity's property (name or description).
 * @param user The activity owner.
 * @param activity The Strava activity details.
 * @param action The action details.
 */
export const defaultAction = async (user: UserData, activity: StravaActivity, action: RecipeAction): Promise<void> => {
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
                logger.warn("Recipes.processAction", `User ${user.id}`, `Activity ${activity.id}`, "Weather tags on recipe, but no location data on activity")
                processedValue = jaul.data.replaceTags(processedValue, weather.emptySummary, "weather.")
            }
        }

        // Change activity name?
        if (action.type == RecipeActionType.Name) {
            activity.name = processedValue
            activity.updatedFields.push("name")
            return
        }

        // Change activity description?
        if (action.type == RecipeActionType.Description) {
            activity.description = processedValue
            activity.updatedFields.push("description")
            return
        }
    } catch (ex) {
        logger.error("Recipes.defaultAction", `User ${user.id}`, `Activity ${activity.id}`, ex)
    }
}

/**
 * Set an activity as commute or not.
 * @param user The activity owner.
 * @param activity The Strava activity details.
 * @param action The action details.
 */
export const commuteAction = async (user: UserData, activity: StravaActivity, action: RecipeAction): Promise<void> => {
    try {
        activity.commute = action.value ? true : false
        activity.updatedFields.push("commute")
        return
    } catch (ex) {
        logger.error("Recipes.commuteAction", `User ${user.id}`, `Activity ${activity.id}`, ex)
    }
}

/**
 * Set an activity's gear.
 * @param user The activity owner.
 * @param activity The Strava activity details.
 * @param action The action details.
 */
export const gearAction = async (user: UserData, activity: StravaActivity, action: RecipeAction): Promise<void> => {
    try {
        let gear = _.find(user.profile.bikes, {id: action.value})

        if (!gear) {
            gear = _.find(user.profile.shoes, {id: action.value})
        }

        if (!gear) {
            this.reportInvalidAction(user, action, "Gear not found")
        } else {
            activity.gear = gear
            activity.updatedFields.push("gear")
        }

        return
    } catch (ex) {
        logger.error("Recipes.gearAction", `User ${user.id}`, `Activity ${activity.id}`, ex)
    }
}

/**
 * Dispatch activity and data via a webhook URL.
 * @param user The activity owner.
 * @param activity The Strava activity details.
 * @param action The action details.
 */
export const webhookAction = async (user: UserData, activity: StravaActivity, action: RecipeAction): Promise<void> => {
    try {
        const options = {
            method: "POST",
            url: action.value,
            timeout: settings.recipes.webhook.timeout,
            headers: {"User-Agent": `${settings.app.title} / ${packageVersion}`},
            data: activity
        }

        // Dispatch webhook.
        try {
            await axios(options)
        } catch (exReq) {
            logger.warn("Recipes.webhookAction", `User ${user.id}`, `Activity ${activity.id}`, `Webhook failed: ${action.value}`, exReq)
        }

        return
    } catch (ex) {
        logger.error("Recipes.webhookAction", `User ${user.id}`, `Activity ${activity.id}`, ex)
    }
}
