// Strautomator Core: Strava Activities

import {StravaActivity, StravaEstimatedFtp, StravaGear, StravaProcessedActivity} from "./types"
import {toStravaActivity} from "./utils"
import {RecipeData} from "../recipes/types"
import {UserData} from "../users/types"
import stravaAthletes from "./athletes"
import api from "./api"
import database from "../database"
import eventManager from "../eventmanager"
import notifications from "../notifications"
import recipes from "../recipes"
import users from "../users"
import _ = require("lodash")
import logger = require("anyhow")
import dayjs from "../dayjs"
const settings = require("setmeup").settings

/**
 * Strava activities manager.
 */
export class StravaActivities {
    private constructor() {}
    private static _instance: StravaActivities
    static get Instance(): StravaActivities {
        return this._instance || (this._instance = new this())
    }

    /**
     * Holds the date of the oldest queued activity to be processed.
     */
    oldestQueueDate: Date = null

    // GET ACTIVITIES
    // --------------------------------------------------------------------------

    /**
     * Get list of activities from Strava.
     * @param user The owner of the activity.
     * @param query Query options.
     * @param checkRecords If true, new records will be checked against the resulting activities.
     */
    getActivities = async (user: UserData, query: any, checkRecords?: boolean): Promise<StravaActivity[]> => {
        logger.debug("Strava.getActivities", `User ${user.id} ${user.displayName}`, query)

        const arrLogQuery = query ? Object.entries(query).map((p) => p[0] + "=" + p[1]) : ["no query"]
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
                        activities.push(toStravaActivity(user, activity))
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

            // Check new records?
            if (checkRecords) {
                stravaAthletes.checkActivityRecords(user, activities)
            }

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
            const data = await api.get(tokens, `activities/${id}?include_all_efforts=0`)
            const activity = toStravaActivity(user, data)

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

    // ACTIVITY QUEUE
    // --------------------------------------------------------------------------

    /**
     * Add activity to the collection of activities to be processed later.
     * @param user The activity's owner (user).
     * @param activityId The activity's unique ID.
     */
    queueActivity = async (user: UserData, activityId: number): Promise<void> => {
        logger.debug("Strava.queueActivity", user.id, activityId)

        // User suspended? Stop here.
        if (user.suspended) {
            logger.warn("Strava.queueActivity", `User ${user.id} ${user.displayName} is suspended, won't process activity ${activityId}`)
            return
        }

        // Add the activity to the queue to be processed on the next batch.
        // If the activity was already queued then keep the original dateQueued.
        try {
            const existing: Partial<StravaProcessedActivity> = await database.get("activities", activityId.toString())
            const activity: Partial<StravaProcessedActivity> = {
                id: activityId,
                dateQueued: existing ? existing.dateQueued : new Date(),
                user: {id: user.id, displayName: user.displayName}
            }

            await database.set("activities", activity, activityId.toString())

            if (existing) {
                logger.warn("Strava.queueActivity", `User ${user.id} ${user.displayName}`, `Activity ${activityId} already queued`)
            } else {
                logger.info("Strava.queueActivity", `User ${user.id} ${user.displayName}`, `Activity ${activityId} queued`)

                // If no queued activities were added since the last processed queue, set current date as the oldest.
                if (!this.oldestQueueDate) {
                    this.oldestQueueDate = new Date()
                }
            }
        } catch (ex) {
            logger.error("Strava.queueActivity", `User ${user.id} ${user.displayName}`, `Activity ${activityId}`, ex)
            throw ex
        }
    }

    /**
     * Check if the oldest activity queued in memory has reached the time threshold,
     * and if so, process all relevant queued activities.
     */
    checkQueuedActivities = async (): Promise<void> => {
        const minDate = dayjs().subtract(settings.strava.delayedProcessingInterval, "seconds")

        if (minDate.isAfter(this.oldestQueueDate)) {
            await this.processQueuedActivities()
        } else {
            const dateLog = this.oldestQueueDate ? this.oldestQueueDate.toString() : "none"
            logger.debug("Strava.checkQueuedActivities", "Nothing to be processed at the moment", `oldestQueueDate = ${dateLog}`)
        }
    }

    /**
     * Get queued activities, with an optional minimum interval.
     * @param beforeDate Only get activities that were queued before that specified date.
     */
    getQueuedActivities = async (beforeDate: Date): Promise<StravaProcessedActivity[]> => {
        const logDate = `Before ${dayjs(beforeDate).format("YYYY-MM-DD HH:mm:ss")}`

        // Get queued activities from the database.
        try {
            const where = [["dateQueued", "<=", beforeDate]]
            const activities: StravaProcessedActivity[] = await database.search("activities", where)

            logger.info("Strava.getQueuedActivities", logDate, `Got ${activities.length || "no"} queued activities`)

            return activities
        } catch (ex) {
            logger.error("Strava.getQueuedActivities", logDate, ex)
        }
    }

    /**
     * Get and process queued activities to be processed with a delay.
     * @param intervalSeconds Only get activities that were queued that many seconds ago.
     */
    processQueuedActivities = async (): Promise<void> => {
        const usersCache: {[id: string]: UserData} = {}

        // Reset oldest queued activity date.
        this.oldestQueueDate = null

        try {
            const beforeDate = dayjs().subtract(settings.strava.delayedProcessingInterval, "seconds").toDate()
            const activities = await this.getQueuedActivities(beforeDate)
            let processedCount = 0

            // No activities to be processed? Stop here.
            if (activities.length == 0) {
                logger.debug("Strava.processQueuedActivities", `No queued activities to be processed`)
                return
            }

            // Process each of the queued activities.
            for (let activity of activities) {
                try {
                    if (!usersCache[activity.user.id]) {
                        usersCache[activity.user.id] = await users.getById(activity.user.id)
                    }

                    const processed = await this.processActivity(usersCache[activity.user.id], activity.id, true)

                    // Queued activity had no matching recipes? Delete it.
                    if (!processed) {
                        await this.deleteQueuedActivity(activity)
                    } else {
                        processedCount++
                    }
                } catch (activityEx) {
                    logger.warn("Strava.processQueuedActivities", `Failed to process queued activity ${activity.id} from user ${activity.user.id}`)
                }
            }

            if (processedCount > 0) {
                logger.info("Strava.processQueuedActivities", `Processed ${processedCount} out of ${activities.length} queued activities`)
            } else {
                logger.debug("Strava.processQueuedActivities", `No processed activities out of ${activities.length} queued activities`)
            }
        } catch (ex) {
            logger.error("Strava.processQueuedActivities", ex)
        }
    }

    /**
     * Delete the queued or processed activity from the database.
     * @param activity The activity to be deleted.
     */
    deleteQueuedActivity = async (activity: StravaProcessedActivity): Promise<void> => {
        try {
            const count = await database.delete("activities", activity.id.toString())

            if (count > 0) {
                logger.info("Strava.deleteQueuedActivity", `User ${activity.user.id} ${activity.user.displayName}`, `Activity ${activity.id} deleted`)
            } else {
                logger.warn("Strava.deleteQueuedActivity", `User ${activity.user.id} ${activity.user.displayName}`, `Activity ${activity.id} not previously saved`)
            }
        } catch (ex) {
            logger.error("Strava.deleteQueuedActivity", `User ${activity.user.id} ${activity.user.displayName}`, `Activity ${activity.id}`, ex)
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
        const useHashtag = user.preferences.activityHashtag

        // Add link back to Strautomator on some percentage of activities (depending on user PRO status and settings).
        // If user has a custom linksOn, it will add the linkback even if user has PRO status.
        const defaultLinksOn = user.isPro ? 0 : settings.plans.free.linksOn
        const linksOn = user.preferences ? user.preferences.linksOn || defaultLinksOn : defaultLinksOn
        const shouldAddLink = (!user.isPro || linksOn > 0) && user.activityCount > 0 && user.activityCount % linksOn == 0 && settings.app.url

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

            // Set correct fields to be updated on the activity.
            for (let field of activity.updatedFields) {
                let targetField = field
                let targetValue = activity[field]
                let targetName = null

                if (field == "gear") {
                    targetField = "gear_id"
                    targetValue = activity.gear.id
                    targetName = activity.gear.name
                } else if (field == "hideHome") {
                    targetField = "hide_from_home"
                } else if (field == "workoutType") {
                    targetField = "workout_type"
                } else if (field == "privateNote") {
                    targetField = "private_note"
                } else if (field == "mapStyle") {
                    targetField = "selected_polyline_style"
                } else if (field.substring(0, 8) == "hideStat") {
                    targetField = ""
                    targetValue = targetValue === true ? "only_me" : "everyone"

                    if (!data.stats_visibility) data.stats_visibility = []
                    const arrFieldName = field.replace("hideStat", "").split(/(?=[A-Z])/)
                    data.stats_visibility.push({type: arrFieldName.join("_").toLowerCase(), visibility: targetValue})
                }

                let targetLog = `${field}=${targetName || activity[field] || activity[targetField]}`

                if (targetField) {
                    data[targetField] = targetValue
                }

                logResult.push(targetLog)
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
     * @param queued Was the activity queued to be processed? Defaults to false (real time).
     */
    processActivity = async (user: UserData, activityId: number, queued?: boolean): Promise<StravaProcessedActivity> => {
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
                const status = ex.response ? ex.response.status : null

                if (status == 404) {
                    logger.warn("Strava.processActivity", `User ${user.id} ${user.displayName}`, `Activity ${activityId} not found`)
                    return null
                }

                // Add the activity to the queue to retry processing it later.
                if (!queued) {
                    await this.queueActivity(user, activityId)
                }

                throw ex
            }

            // Check for new records.
            stravaAthletes.checkActivityRecords(user, [activity])

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
                logger.info("Strava.processActivity", `User ${user.id} ${user.displayName}`, `Activity ${activityId}`, queued ? "From queue" : "Realtime", `Recipes: ${recipeIds.join(", ")}`)

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

                eventManager.emit("Strava.processActivity", user, activity)
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
     * @param dateFrom Activities processed since date.
     * @param dateTo Activities processed up to date.
     * @param limit Limit how many results should be returned?
     *
     */
    getProcessedActivites = async (user: UserData, dateFrom?: Date, dateTo?: Date, limit?: number): Promise<StravaProcessedActivity[]> => {
        try {
            let logFrom = ""
            let logTo = ""
            let logLimit = ""

            const where: any[] = [["user.id", "==", user.id]]

            if (dateFrom) {
                where.push(["dateProcessed", ">=", dateFrom])
                logFrom = ` from ${dayjs(dateFrom).format("YYYY-MM-DD")}`
            }
            if (dateTo) {
                where.push(["dateProcessed", "<=", dateTo])
                logTo = ` to ${dayjs(dateTo).format("YYYY-MM-DD")}`
            }
            if (limit) {
                logLimit = `, limit ${logLimit}`
            }

            const activities = await database.search("activities", where, ["dateProcessed", "desc"], limit)
            logger.info("Strava.getProcessedActivites", `User ${user.id} ${user.displayName}`, `Got ${activities.length} activities${logFrom}${logTo}${logLimit}`)

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
                dateProcessed: dayjs.utc().toDate(),
                user: {
                    id: user.id,
                    displayName: user.displayName
                },
                recipes: recipeDetails,
                updatedFields: updatedFields
            }

            // Extra activity details in case user has not opted for the privacy mode.
            if (!user.preferences.privacyMode) {
                data.type = activity.type
                data.name = activity.name
                data.dateStart = activity.dateStart
                data.utcStartOffset = activity.utcStartOffset

                if (activity.newRecords) {
                    data.newRecords = activity.newRecords
                }
            }

            // Linkback added to activity?
            if (activity.linkback) {
                logger.info("Strava.linkback", `User ${user.id} ${user.displayName}`, `Activity ${activity.id}`)
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

    /**
     * Delete all saved / processed activities for the specified user.
     * Returns the number of deleted actvities.
     * @param user The user account.
     */
    deleteProcessedActivities = async (user: UserData): Promise<number> => {
        try {
            const count = await database.delete("activities", ["user.id", "==", user.id])
            logger.info("Strava.deleteProcessedActivities", `User ${user.id} ${user.displayName}`, `Deleted ${count || "no"} activities`)
            return count
        } catch (ex) {
            logger.error("Strava.deleteProcessedActivities", `User ${user.id} ${user.displayName}`, ex)
            return 0
        }
    }

    // ACTIVITY HELPERS
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
                logger.debug("Strava.ftpFromActivities", `User ${user.id} ${user.displayName}`, `${weeks} weeks`, "Could not estimate FTP")
            }

            return result
        } catch (ex) {
            logger.error("Strava.ftpFromActivities", `User ${user.id} ${user.displayName}`, `${weeks} weeks`, "Failed to estimate FTP")
        }
    }
}

// Exports...
export default StravaActivities.Instance
