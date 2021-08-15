// Strautomator Core: Strava Activities

import {StravaActivity, StravaGear, StravaProcessedActivity, StravaEstimatedFtp} from "./types"
import {toStravaActivity} from "./types"
import {RecipeData} from "../recipes/types"
import {UserData} from "../users/types"
import stravaAthletes from "./athletes"
import api from "./api"
import database from "../database"
import notifications from "../notifications"
import recipes from "../recipes"
import users from "../users"
import _ = require("lodash")
import logger = require("anyhow")
import dayjs from "../dayjs"
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
     * Get list of activities from Strava.
     * @param user The owner of the activity.
     * @param query Query options.
     */
    getActivities = async (user: UserData, query: any): Promise<StravaActivity[]> => {
        logger.debug("Strava.getActivities", `User ${user.id} ${user.displayName}`, query)

        const arrLogQuery = Object.entries(query).map((p) => p[0] + "=" + p[1])
        const logQuery = arrLogQuery.join(", ")

        try {
            const tokens = user.stravaTokens
            const activities: StravaActivity[] = []

            // Default query options.
            if (!query.per_page) query.per_page = 200
            if (!query.page) query.page = 1

            // Fetch activities from Strava, respecting the pagination.
            while (query.page) {
                try {
                    const data = await api.get(tokens, "athlete/activities", query)

                    // No data returned? Stop here.
                    if (!data || data.length == 0) {
                        query.page = false
                        break
                    }

                    // Iterate and transform activities from raw strava data to StravaActivity models.
                    for (let activity of data) {
                        activities.push(toStravaActivity(activity, user))
                    }

                    // If count is more than half the page size, consider it might have more and increment the page.
                    if (data.length >= query.per_page / 2) {
                        query.page++
                    } else {
                        query.page = false
                        break
                    }
                } catch (innerEx) {
                    logger.error("Strava.getActivities", `User ${user.id} ${user.displayName}`, logQuery, `Page ${query.page}`, innerEx)
                    query.page = false
                }
            }

            logger.info("Strava.getActivities", `User ${user.id} ${user.displayName}`, logQuery, `Got ${activities.length} activities`)
            return activities
        } catch (ex) {
            logger.error("Strava.getActivities", `User ${user.id} ${user.displayName}`, logQuery, ex)
            throw ex
        }
    }

    /**
     * Get a single activity from Strava.
     * @param user The owner of the activity.
     * @param id The activity ID.
     */
    getActivity = async (user: UserData, id: number | string): Promise<StravaActivity> => {
        logger.debug("Strava.getActivity", `User ${user.id} ${user.displayName}`, id)

        try {
            const tokens = user.stravaTokens
            const data = await api.get(tokens, `activities/${id}?include_all_efforts=false`)
            const activity = toStravaActivity(data, user)

            // Activity's gear was set?
            // First we try fetching gear details from cached database user.
            // Otherwise get directly from the API.
            if (data.gear_id) {
                try {
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
                    activity.gear = gear ? gear : await stravaAthletes.getGear(user, data.gear_id)
                } catch (ex) {
                    logger.warn("Strava.getActivity", id, "Could not get activity's gear details")
                }
            } else {
                activity.gear = null
            }

            // Get start time and timezone to be logged.
            let timeStart
            if (activity.dateStart) {
                const offset = activity.utcStartOffset > 0 ? `+${activity.utcStartOffset}` : activity.utcStartOffset
                timeStart = `${dayjs.utc(activity.dateStart).format("LTS")}, offset ${offset}`
            } else {
                timeStart = "No dateStart"
            }

            logger.info("Strava.getActivity", `User ${user.id} ${user.displayName}`, `Activity ${id}`, activity.name, timeStart)
            return activity
        } catch (ex) {
            if (ex.toString().indexOf("404") > 0) {
                logger.warn("Strava.getActivity", `User ${user.id} ${user.displayName}`, `Activity ${id}`, ex)
            } else {
                logger.error("Strava.getActivity", `User ${user.id} ${user.displayName}`, `Activity ${id}`, ex)
            }

            throw ex
        }
    }

    /**
     * Get an activity stream.
     * @param user The owner of the activity.
     * @param id The activity ID.
     */
    getStream = async (user: UserData, id: number | string): Promise<any> => {
        logger.debug("Strava.getStream", `User ${user.id} ${user.displayName}`, id)

        try {
            const tokens = user.stravaTokens
            const data = await api.get(tokens, `activities/${id}/streams`)
            let datapoints = 0

            // Count how many stream data points we have for this activity.
            for (let stream of data) {
                if (stream.data) datapoints += stream.data.length
            }

            logger.info("Strava.getStream", `User ${user.id} ${user.displayName}`, `Activity ${id}`, `${datapoints} data points`)
            return data
        } catch (ex) {
            logger.error("Strava.getStream", `User ${user.id} ${user.displayName}`, `Activity ${id}`, ex)
            throw ex
        }
    }

    // SET AND PROCESS ACTIVITIES
    // --------------------------------------------------------------------------

    /**
     * Updates a single activity on Strava.
     * @param user Owner of the activity.
     * @param activity The ativity data.
     */
    setActivity = async (user: UserData, activity: StravaActivity): Promise<void> => {
        logger.debug("Strava.setActivity", user.id, activity.id)

        const data: any = {}
        const logResult = []
        const useHashtag = user.preferences && user.preferences.activityHashtag

        // Add link back to Strautomator on some percentage of activities (depending on user PRO status and settings).
        // If user has a custom linksOn, it will add the linkback even if user has PRO status.
        const defaultLinksOn = user.isPro ? 0 : settings.plans.free.linksOn
        const linksOn = user.preferences ? user.preferences.linksOn || defaultLinksOn : defaultLinksOn
        const shouldAddLink = (!user.isPro || linksOn > 0) && user.activityCount > 0 && user.activityCount % linksOn == 0

        try {
            if (!activity.updatedFields || activity.updatedFields.length == 0) {
                logger.info("Strava.setActivity", `${activity.id}, from user ${user.id}`, "No fields were updated")
                return
            }

            // Time to add a linkback on the activity?
            if (shouldAddLink) {
                activity.linkback = true

                // By default, link will be added to the description.
                if (!useHashtag) {
                    let appUrl = settings.app.url

                    // Make sure app URL does not end with / (better optics).
                    if (appUrl.substring(appUrl.length - 1) == "/") {
                        appUrl = appUrl.substring(0, appUrl.length - 1)
                    }

                    // Only proceed if a linkback was not previously added.
                    const alreadyLinked = activity.description ? activity.description.indexOf(appUrl) >= 0 : false
                    if (!alreadyLinked) {
                        const linkTexts = settings.recipes.linksTexts
                        let text = _.sample(linkTexts)

                        // If activity has a description, add link on a new line.
                        if (activity.description && activity.description.length > 0) {
                            text = `\n${text}`
                        } else {
                            activity.description = ""
                        }

                        // Update description with link-back and add to list of updated fields.
                        activity.description += `${text} ${appUrl}`

                        if (activity.updatedFields.indexOf("description") < 0) {
                            activity.updatedFields.push("description")
                        }
                    } else {
                        logResult.push("Linkback already present on description")
                    }
                }

                // User has set the hashtag preference? Add it to the name of the activity instead, but
                // only if no hashtag was previously set on the activity.
                else {
                    const alreadyLinked = activity.name ? activity.name.indexOf(settings.app.hashtag) >= 0 : false
                    if (!alreadyLinked) {
                        if (!activity.name) {
                            activity.name = ""
                        }

                        activity.name += ` ${settings.app.hashtag}`

                        if (activity.updatedFields.indexOf("name") < 0) {
                            activity.updatedFields.push("name")
                        }
                    } else {
                        logResult.push("Linkback hashtag already present on name")
                    }
                }
            }

            // Set fields to be updated on the activity.
            for (let field of activity.updatedFields) {
                if (field == "gear") {
                    data["gear_id"] = activity.gear.id
                    logResult.push(`${field}=${activity.gear.name}`)
                } else {
                    data[field] = activity[field]
                    logResult.push(`${field}=${activity[field]}`)
                }
            }

            // If running on test mode, log the activity instead.
            if (settings.strava.testMode) {
                logger.warn("Strava.setActivity", "TEST MODE (do not write to Strava)", activity.id, logResult.join(", "))
            } else {
                await api.put(user.stravaTokens, `activities/${activity.id}`, null, data)
                logger.info("Strava.setActivity", `${activity.id}, from user ${user.id}`, logResult.join(", "))
            }
        } catch (ex) {
            logger.error("Strava.setActivity", `${activity.id}, from user ${user.id}`, logResult.join(", "), ex)
            throw ex
        }
    }

    /**
     * Process activity event pushed by Strava.
     * @param user The activity's owner (user).
     * @param activityId The activity's unique ID.
     * @param retryCount How many times it tried to process the activity.
     */
    processActivity = async (user: UserData, activityId: number): Promise<StravaProcessedActivity> => {
        logger.debug("Strava.processActivity", user.id, activityId)

        let saveError
        let activity: StravaActivity

        try {
            let recipe: RecipeData
            let recipeIds = []

            // If user has no recipes? Stop here.
            if (!user.recipes || Object.keys(user.recipes).length == 0) {
                logger.info("Strava.processActivity", `User ${user.id} ${user.displayName} has no recipes, won't process activity ${activityId}`)
                return null
            }

            // User suspended? Stop here.
            if (user.suspended) {
                logger.warn("Strava.processActivity", `User ${user.id} ${user.displayName} is suspended, won't process activity ${activityId}`)
                return null
            }

            // Get activity details from Strava.
            try {
                activity = await this.getActivity(user, activityId)
            } catch (ex) {
                if (ex.response && ex.response.status == 404) {
                    logger.warn("Strava.processActivity", `User ${user.id} ${user.displayName}`, `Activity ${activityId} not found`)
                    return null
                }

                throw ex
            }

            // Get recipes, having the defaults first and then sorted by order.
            let sortedRecipes: any[] = _.sortBy(Object.values(user.recipes), ["defaultFor", "order", "title"])

            // If PRO subscription was cancelled but user still have many recipes, consider just the first ones.
            if (!user.isPro && sortedRecipes.length > settings.plans.free.maxRecipes) {
                sortedRecipes = sortedRecipes.slice(0, settings.plans.free.maxRecipes)
            }

            // Evaluate each of user's recipes, and set update to true if something was processed.
            for (recipe of sortedRecipes) {
                try {
                    if (await recipes.evaluate(user, recipe.id, activity)) {
                        recipeIds.push(recipe.id)
                    }
                } catch (innerEx) {
                    logger.error("Strava.processActivity", `User ${user.id} ${user.displayName}`, `Activity ${activityId}`, innerEx)
                }
            }

            // Activity updated? Save to Strava and increment activity counter.
            if (recipeIds.length > 0) {
                logger.info("Strava.processActivity", `User ${user.id} ${user.displayName}`, `Activity ${activityId}`, `Recipes: ${recipeIds.join(", ")}`)

                // Remove duplicates from list of updated fields.
                activity.updatedFields = _.uniq(activity.updatedFields)

                // Save, and if it fails try again once.
                try {
                    await this.setActivity(user, activity)
                } catch (ex) {
                    logger.error("Strava.processActivity", `User ${user.id} ${user.displayName}`, `Activity ${activityId}`, ex)
                    saveError = ex.friendlyMessage || ex.message || ex

                    // Create notification for user in case the activity exists but could not be processed.
                    if (activity.dateEnd) {
                        try {
                            let aDate = dayjs(activity.dateEnd)
                            if (activity.utcStartOffset) {
                                aDate = aDate.add(activity.utcStartOffset, "minutes")
                            }

                            const title = `Failed to process activity ${activity.id}`
                            const body = `There was an error processing your ${activity.type} "${activity.name}", on ${aDate.format("lll")}. Strava returned an error message.`

                            await notifications.createNotification(user, {title: title, body: body, activityId: activity.id})
                        } catch (innerEx) {
                            logger.warn("Strava.processActivity", `Failed creating notification for activity ${activityId}, from user ${user.id}`)
                        }
                    }
                }

                // Save activity to the database and update count on user data.
                // If failed, log error but this is not essential so won't throw.
                try {
                    const processedActivity = await this.saveProcessedActivity(user, activity, recipeIds, saveError)
                    await users.setActivityCount(user)
                    user.activityCount++

                    return processedActivity
                } catch (ex) {
                    logger.error("Strava.processActivity", `User ${user.id} ${user.displayName}`, `Activity ${activityId}`, "Can't save to database", ex)
                }
            } else {
                logger.info("Strava.processActivity", `User ${user.id} ${user.displayName}`, `Activity ${activityId}`, `No matching recipes`)
            }
        } catch (ex) {
            logger.error("Strava.processActivity", `User ${user.id} ${user.displayName}`, `Activity ${activityId}`, ex)
            throw ex
        }

        return null
    }

    /**
     * Get saved processed activities for the specified user.
     * @param user The activities owner.
     * @param limit Limit how many results should be returned?
     */
    getProcessedActivites = async (user: UserData, limit?: number): Promise<StravaProcessedActivity[]> => {
        try {
            const activities = await database.search("activities", ["user.id", "==", user.id], ["dateProcessed", "desc"], limit)
            logger.info("Strava.getProcessedActivites", `User ${user.id} ${user.displayName}`, `Got ${activities.length} processed activities`)

            return activities
        } catch (ex) {
            logger.error("Strava.getProcessedActivites", `User ${user.id} ${user.displayName}`, ex)
        }
    }

    /**
     * Save a processed activity with user and recipe details to the database.
     * @param user The activity's owner.
     * @param activity The Strava activity details.
     * @param recipeIds Array of triggered recipe IDs.
     * @param error If errored, this will contain the error details.
     */
    saveProcessedActivity = async (user: UserData, activity: StravaActivity, recipeIds: string[], error?: string): Promise<StravaProcessedActivity> => {
        try {
            let recipeDetails = {}
            let updatedFields = {}

            // Get recipe summary.
            for (let id of recipeIds) {
                recipeDetails[id] = {
                    title: user.recipes[id].title,
                    conditions: _.map(user.recipes[id].conditions, recipes.getConditionSummary),
                    actions: _.map(user.recipes[id].actions, recipes.getActionSummary)
                }
            }

            // Get updated fields.
            for (let field of activity.updatedFields) {
                if (field == "gear") {
                    updatedFields[field] = `${activity.gear.name} (${activity.gear.id})`
                } else {
                    updatedFields[field] = activity[field]
                }
            }

            // Data to be saved on the database.
            const data: StravaProcessedActivity = {
                id: activity.id,
                type: activity.type,
                name: activity.name,
                dateStart: activity.dateStart,
                dateProcessed: dayjs.utc().toDate(),
                utcStartOffset: activity.utcStartOffset,
                user: {
                    id: user.id,
                    displayName: user.displayName
                },
                recipes: recipeDetails,
                updatedFields: updatedFields
            }

            // Linkback added to activity?
            if (activity.linkback) {
                data.linkback = true
            }

            // Make sure error is a string (if an error was passed).
            if (error) {
                data.error = error.toString()
            }

            // Save and return result.
            await database.set("activities", data, activity.id.toString())
            logger.debug("Strava.saveProcessedActivity", data)

            return data
        } catch (ex) {
            logger.error("Strava.saveProcessedActivity", `User ${user.id} ${user.displayName}`, `Activity ${activity.id}`, ex)
            throw ex
        }
    }

    // ACTIVITY DATA CALCULATIONS
    // --------------------------------------------------------------------------

    /**
     * Estimate the user's FTP based on activities from the last few weeks (default 14).
     * @param user The user to fetch the FTP for.
     * @param weeks Number of weeks to fetch activites for.
     */
    ftpFromActivities = async (user: UserData, weeks?: number): Promise<StravaEstimatedFtp> => {
        logger.debug("Strava.ftpFromActivities", user.id, `Weeks ${weeks}`)

        try {
            // Validate weeks parameter.
            if (!weeks || weeks < 1) weeks = settings.strava.ftp.weeks
            if (weeks > settings.strava.ftp.maxWeeks) {
                logger.warn("Strava.ftpFromActivities", `User ${user.id} ${user.displayName}`, `Weeks reduced from ${weeks} to ${settings.strava.ftp.maxWeeks}`)
                weeks = settings.strava.ftp.maxWeeks
            }

            // Timestamps for the activities date filter.
            const dateAfter = dayjs.utc().subtract(weeks, "weeks")
            const tsAfter = dateAfter.valueOf() / 1000
            const tsBefore = new Date().valueOf() / 1000

            // Get activities for the passed number of weeks.
            const activities = await this.getActivities(user, {before: tsBefore, after: tsAfter})
            const result = await stravaAthletes.estimateFtp(user, activities)

            if (result) {
                logger.info("Strava.ftpFromActivities", `User ${user.id} ${user.displayName}`, `${weeks} weeks`, `Estimated FTP: ${result.ftpWatts}w`)
            } else {
                logger.info("Strava.ftpFromActivities", `User ${user.id} ${user.displayName}`, `${weeks} weeks`, "Could not estimate FTP")
            }

            return result
        } catch (ex) {
            logger.error("Strava.ftpFromActivities", `User ${user.id} ${user.displayName}`, `${weeks} weeks`, "Failed to estimate FTP")
        }
    }
}

// Exports...
export default StravaActivities.Instance
