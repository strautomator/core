// Strautomator Core: Strava Activities

import {StravaActivity, StravaGear, StravaTokens, StravaProcessedActivity} from "./types"
import {toStravaActivity} from "./types"
import {RecipeData} from "../recipes/types"
import {UserData} from "../users/types"
import stravaAthletes from "./athletes"
import api from "./api"
import database from "../database"
import recipes from "../recipes"
import users from "../users"
import _ = require("lodash")
import cache = require("bitecache")
import logger = require("anyhow")
const settings = require("setmeup").settings

/**
 * Strava webhooks manager.
 */
export class StravaActivities {
    private constructor() {}
    private static _instance: StravaActivities
    static get Instance(): StravaActivities {
        return this._instance || (this._instance = new this())
    }

    // GET ACTIVITIES
    // --------------------------------------------------------------------------

    /**
     * Get a single activity from Strava.
     * @param tokens Strava access tokens.
     * @param id The activity ID.
     */
    getActivity = async (tokens: StravaTokens, id: number | string): Promise<StravaActivity> => {
        logger.debug("Strava.getActivity", id)

        try {
            const data = await api.get(tokens, `activities/${id}?include_all_efforts=false`)
            const activity = toStravaActivity(data)

            // Activity's gear was set?
            // First we try fetching gear details from cached database user.
            // Otherwise get directly from the API.
            if (data.gear_id) {
                try {
                    let user: UserData = cache.get("database", `users-${data.athlete.id}`)
                    let gear: StravaGear

                    // Search for bikes.
                    for (let bike of user.profile.bikes) {
                        if (bike.id == id) {
                            gear = bike
                        }
                    }

                    // Search for shoes.
                    for (let shoe of user.profile.shoes) {
                        if (shoe.id == id) {
                            gear = shoe
                        }
                    }

                    // Set correct activity gear.
                    activity.gear = gear ? gear : await stravaAthletes.getGear(tokens, data.gear_id)
                } catch (ex) {
                    logger.warn("Strava.getActivity", id, "Could not get activity's gear details")
                }
            } else {
                activity.gear = null
            }

            return activity
        } catch (ex) {
            logger.error("Strava.getActivity", id, ex)
            throw ex
        }
    }

    /**
     * Get list of activities from Strava.
     * @param tokens Strava access tokens.
     * @param query Query options, currently only supports "since".
     */
    getActivities = async (tokens: StravaTokens, query: any): Promise<StravaActivity[]> => {
        logger.debug("Strava.getActivities", query)

        const arrLogQuery = Object.entries(query).map((p) => p[0] + "=" + p[1])
        const logQuery = arrLogQuery.join(", ")

        try {
            // Default query options.
            if (!query.per_page) {
                query.per_page = 200
            }

            // Fetch user activities from Strava.
            let activities = await api.get(tokens, "athlete/activities", query)

            return activities
        } catch (ex) {
            logger.error("Strava.getActivities", logQuery, ex)
            throw ex
        }
    }

    // SET AND PROCESS ACTIVITIES
    // --------------------------------------------------------------------------

    /**
     * Updates a single activity on Strava.
     * @param tokens Strava access tokens.
     * @param activity The ativity data.
     */
    setActivity = async (tokens: StravaTokens, activity: StravaActivity): Promise<void> => {
        logger.debug("Strava.setActivity", activity.id)

        const logResult = []
        const data = {}

        try {
            if (!activity.updatedFields || activity.updatedFields.length == 0) {
                logger.info("Strava.setActivity", activity.id, "No fields were updated")
                return
            }

            for (let field of activity.updatedFields) {
                data[field] = activity[field]
                logResult.push(`${field}=${activity[field]}`)
            }

            await api.put(tokens, `activities/${activity.id}`, null, data)

            logger.info("Strava.setActivity", activity.id, logResult.join(", "))
        } catch (ex) {
            logger.error("Strava.setActivity", activity.id, ex, logResult.join(", "))
            throw ex
        }
    }

    /**
     * Process activity event pushed by Strava.
     * @param user The activity's owner (user).
     * @param activityId The activity's unique ID.
     * @param retryCount How many times it tried to process the activity.
     */
    processActivity = async (user: UserData, activityId: number, retryCount?: number): Promise<void> => {
        logger.debug("Strava.processActivity", user.id, activityId, retryCount)

        try {
            if (Object.keys(user.recipes).length == 0) {
                logger.info("Strava.processActivity", `User ${user.id} has no recipes, won't process activity ${activityId}`)
                return
            }

            // Retry count defaults to 0.
            if (!retryCount) {
                retryCount = 0
            }

            let activity: StravaActivity
            let recipeIds = []

            // Get activity details from Strava.
            try {
                activity = await this.getActivity(user.stravaTokens, activityId)
            } catch (ex) {
                logger.error("Strava.processActivity", `Activity ${activityId} for user ${user.id} not found`)
                return
            }

            let recipe: RecipeData

            // Evaluate each of user's recipes, and set update to true if something was processed.
            for (recipe of Object.values(user.recipes)) {
                if (await recipes.evaluate(user, recipe.id, activity)) {
                    recipeIds.push(recipe.id)
                }
            }

            // Activity updated? Save to Strava and increment activity counter.
            if (recipeIds.length > 0) {
                logger.info("Strava.processActivity", `User ${user.id}`, `Activity ${activityId}`, `Recipes: ${recipeIds.join(", ")}`)

                try {
                    await this.setActivity(user.stravaTokens, activity)
                } catch (ex) {
                    if (retryCount < settings.strava.api.maxRetry) {
                        const retryJob = async () => {
                            await this.processActivity(user, activityId, retryCount + 1)
                        }

                        setTimeout(retryJob, settings.strava.api.retryInterval)
                        logger.warn("Strava.processActivity", `User ${user.id}`, `Activity ${activityId}`, `Failed, will try again...`)
                    } else {
                        logger.error("Strava.processActivity", `User ${user.id}`, `Activity ${activityId}`, ex)

                        // Save failed activity to database.
                        await this.saveProcessedActivity(user, activity, recipeIds, true)
                    }
                }

                // Save activity to the database and update count on user data.
                // If failed, log error but this is not essential so won't throw.
                try {
                    await this.saveProcessedActivity(user, activity, recipeIds)
                    await users.setActivityCount(user)
                } catch (ex) {
                    logger.error("Strava.processActivity", `User ${user.id}`, `Activity ${activityId}`, "Can't save to database", ex)
                }
            } else {
                logger.info("Strava.processActivity", `User ${user.id}`, `Activity ${activityId} from ${activity.dateStart}`, `No matching recipes`)
            }
        } catch (ex) {
            logger.error("Strava.processActivity", `User ${user.id}`, `Activity ${activityId}`, ex)
        }
    }

    /**
     * Save a processed activity with user and recipe details to the database.
     * @param user The activity's owner.
     * @param activity The Strava activity details.
     * @param recipeIds Array of triggered recipe IDs.
     * @param failed If true, mark activity as failed so it gets stored on a different collection.
     */
    saveProcessedActivity = async (user: UserData, activity: StravaActivity, recipeIds: string[], failed?: boolean): Promise<void> => {
        try {
            let recipeDetails = {}

            // Get recipe summary.
            for (let id of recipeIds) {
                recipeDetails[id] = {
                    title: user.recipes[id].title,
                    conditions: _.map(user.recipes[id].conditions, recipes.getConditionSummary),
                    actions: _.map(user.recipes[id].actions, recipes.getActionSummary)
                }
            }

            // Data to be saved on the database.
            const data: StravaProcessedActivity = {
                id: activity.id,
                type: activity.type,
                dateStart: activity.dateStart,
                dateProcessed: new Date(),
                user: {
                    id: user.id,
                    displayName: user.displayName
                },
                recipes: recipeDetails
            }

            // Get correct collection depending if activity failed to process.
            const table = failed ? "activities-failed" : "activities"

            // Save and return result.
            await database.set(table, data, activity.id.toString())
            logger.debug("Strava.saveProcessedActivity", data)
        } catch (ex) {
            logger.error("Strava.saveProcessedActivity", `User ${user.id} - ${user.displayName}`, `Activity ${activity.id}`, ex)
        }
    }
}

// Exports...
export default StravaActivities.Instance
