// Strautomator Core: Strava Activity Processing

import {StravaActivity, StravaActivityFilter, StravaProcessedActivity, StravaRideType, StravaRunType} from "./types"
import {isActivityIgnored} from "./utils"
import {updateBatteryTracker} from "../gearwear/battery"
import {RecipeData} from "../recipes/types"
import {getActionSummary, getConditionSummary} from "../recipes/utils"
import {UserData} from "../users/types"
import {weatherSummaryString} from "../weather/utils"
import stravaActivities from "./activities"
import stravaAthletes from "./athletes"
import stravaPerformance from "./performance"
import database from "../database"
import eventManager from "../eventmanager"
import notifications from "../notifications"
import recipes from "../recipes"
import users from "../users"
import weather from "../weather"
import _ from "lodash"
import cache from "bitecache"
import logger from "anyhow"
import * as logHelper from "../loghelper"
import dayjs from "../dayjs"
const settings = require("setmeup").settings

/**
 * Strava activity processing manager.
 */
export class StravaActivityProcessing {
    private constructor() {}
    private static _instance: StravaActivityProcessing
    static get Instance(): StravaActivityProcessing {
        return this._instance || (this._instance = new this())
    }

    // PROCESSING ACTIVITIES
    // --------------------------------------------------------------------------

    /**
     * Get a single processed activity.
     * @param user The activities owner.
     * @param id The activity ID.
     *
     */
    getProcessedActivity = async (user: UserData, id: number): Promise<StravaProcessedActivity> => {
        try {
            const activity = await database.get("activities", id.toString())

            if (activity) {
                logger.info("Strava.getProcessedActivity", logHelper.user(user), logHelper.activity(activity))
                return activity
            }

            logger.warn("Strava.getProcessedActivity", logHelper.user(user), id, "Not found")
            return null
        } catch (ex) {
            logger.error("Strava.getProcessedActivity", logHelper.user(user), id, ex)
            throw ex
        }
    }

    /**
     * Get saved processed activities for the specified user.
     * @param user The activities owner.
     * @param dateFrom Activities processed since date.
     * @param dateTo Activities processed up to date.
     * @param limit Optional, limit how many results should be returned?
     */
    getProcessedActivities = async (user: UserData, dateFrom?: Date, dateTo?: Date, limit?: number): Promise<StravaProcessedActivity[]> => {
        try {
            let logFrom = ""
            let logTo = ""
            let logLimit = ""

            const where: any[] = [["userId", "==", user.id]]
            if (dateFrom) {
                where.push(["dateProcessed", ">=", dateFrom])
                logFrom = ` from ${dayjs(dateFrom).format("ll")}`
            }
            if (dateTo) {
                where.push(["dateProcessed", "<=", dateTo])
                logTo = ` to ${dayjs(dateTo).format("ll")}`
            }
            if (limit) {
                logLimit = `, limit ${limit}`
            }

            const activities = await database.search("activities", where, ["dateProcessed", "desc"], limit)
            logger.info("Strava.getProcessedActivities", logHelper.user(user), `Got ${activities.length || "no"} activities${logFrom}${logTo}${logLimit}`)

            // TODO! Remove this once all previous activities have been updated with the new backlink field.
            activities.forEach((a) => {
                if (a.linkback) {
                    a.backlink = true
                }
            })

            return activities
        } catch (ex) {
            logger.error("Strava.getProcessedActivities", logHelper.user(user), dateFrom, dateTo, ex)
        }
    }

    /**
     * Batch process activities for the specified user. This will effectively add the
     * activities for the specified range to the processing queue.
     * @param user The activities owner (user).
     * @param dDateFrom Activities since (from that date).
     * @param dDateTo Activities up to (till that date), if not passed will use today.
     * @param filter Additional activity filters.
     */
    batchProcessActivities = async (user: UserData, dDateFrom: dayjs.Dayjs, dDateTo?: dayjs.Dayjs, filter?: StravaActivityFilter): Promise<number> => {
        if (!dDateTo) dDateTo = dayjs()
        if (!filter) filter = {}

        let activityCount = 0
        const dateLog = `${dDateFrom.format("lll")} to ${dDateTo.format("lll")}`
        const now = dayjs().utc()

        try {
            if (user.suspended || !user.recipes || Object.keys(user.recipes).length == 0) {
                logger.info("Strava.batchProcessActivities", logHelper.user(user), "User suspended or has no recipes, won't process")
                return null
            }

            // Check if passed date range is valid.
            const maxDays = !user.isTrial && user.isPro ? settings.plans.pro.batchDays : settings.plans.free.batchDays
            const minDate = now.subtract(maxDays + 1, "days").startOf("day")
            if (minDate.isAfter(dDateFrom)) {
                throw new Error(`Invalid date range, minimum allowed date: ${minDate.format("LL")}`)
            }

            // Fetch user activities for the specified time range.
            const activities = await stravaActivities.getActivities(user, {after: dDateFrom, before: dDateTo})

            if (activities.length == 0) {
                logger.warn("Strava.batchProcessActivities", logHelper.user(user), dateLog, "No activities for that date range")
                return 0
            }

            // Add each of the user's activities to the processing queue, but only if they are valid
            // according to the (optional) passed filters.
            for (let activity of activities) {
                try {
                    let valid = true
                    if (filter.private === true && !activity.private) valid = false
                    if (filter.private === false && activity.private) valid = false
                    if (filter.commute === true && !activity.commute) valid = false
                    if (filter.commute === false && activity.commute) valid = false
                    if (filter.race === true && activity.workoutType != StravaRideType.Race && activity.workoutType != StravaRunType.Race) valid = false
                    if (filter.race === false && (activity.workoutType == StravaRideType.Race || activity.workoutType == StravaRunType.Race)) valid = false
                    if (filter.sportType && activity.sportType != filter.sportType) valid = false

                    // Passed the activity filters? Proceed and queue.
                    if (valid) {
                        await this.queueActivity(user, activity.id, true)
                        activityCount++
                    }
                } catch (innerEx) {
                    logger.error("Strava.batchProcessActivities", logHelper.user(user), logHelper.activity(activity), innerEx)
                }
            }

            // Update user with the current date.
            await users.update({id: user.id, displayName: user.displayName, dateLastBatchProcessing: now.toDate()})

            logger.info("Strava.batchProcessActivities", logHelper.user(user), dateLog, `Queued ${activities.length} activities`)

            return activityCount
        } catch (ex) {
            logger.error("Strava.batchProcessActivities", logHelper.user(user), dateLog, ex)
            throw ex
        }
    }

    /**
     * Process activity event pushed by Strava.
     * @param user The activity's owner (user).
     * @param pActivity Processed activity metadata.
     */
    processActivity = async (user: UserData, pActivity: Partial<StravaProcessedActivity>): Promise<StravaProcessedActivity> => {
        const debugLogger = user.debug ? logger.warn : logger.debug
        const activityId = pActivity.id
        let saveError
        let activity: StravaActivity

        try {
            let recipe: RecipeData
            let recipeIds = []

            // User suspended? Stop here.
            if (user.suspended) {
                logger.warn("Strava.processActivity", logHelper.user(user), `User suspended, won't process activity ${activityId}`)
                return null
            }

            // If user has no recipes and hasn't logged in for a while? Stop here.
            if ((!user.recipes || Object.keys(user.recipes).length == 0) && dayjs().diff(user.dateLogin, "days") > settings.users.idleDays.default) {
                logger.info("Strava.processActivity", logHelper.user(user), `No recipes, user is idle, won't process activity ${activityId}`)
                return null
            }

            // Get activity details from Strava.
            try {
                activity = await stravaActivities.getActivity(user, activityId)
                if (isActivityIgnored(user, activity, "automation")) {
                    return null
                }

                if (pActivity.batch) {
                    activity.batch = true
                }
            } catch (ex) {
                const status = ex.response?.status || ex.status || null
                const message = ex.message || ex.toString()

                if (status == 404) {
                    logger.warn("Strava.processActivity", logHelper.user(user), `Activity ${activityId} not found`)
                    return null
                }

                // Add the activity to the queue to retry processing it later.
                if (!pActivity.queued) {
                    await this.queueActivity(user, activityId, false, `${status}: ${message}`)
                }

                ex.message = `Failed to get activity from Strava: ${message}`
                throw ex
            }

            // Update battery tracking straight away if user is PRO and activity was made with a Garmin or Wahoo device.
            try {
                const device = activity.device?.toLowerCase() || ""
                const isGarminWahoo = (user.garmin?.id || user.wahoo?.id) && (device.includes("garmin") || device.includes("wahoo"))
                if (user.isPro && isGarminWahoo) {
                    updateBatteryTracker(user, [activity])
                }
            } catch (batteryEx) {
                logger.error("Strava.processActivity", logHelper.user(user), `Activity ${activityId}`, "Failed to update sensor batteries", batteryEx)
            }

            // Check for FTP updates in case user has opted-in and the activity happened in the last few days.
            try {
                const shouldUpdateFtp = user.isPro && user.profile.ftp && user.preferences.ftpAutoUpdate
                const powerIncreased = activity.hasPower && activity.wattsWeighted >= user.profile.ftp
                const isRecent = dayjs().utc().subtract(2, "days").isBefore(activity.dateStart)
                if (shouldUpdateFtp && powerIncreased && isRecent) {
                    stravaPerformance.processPerformance(user, [activity], true)
                }
            } catch (ftpEx) {
                logger.error("Strava.processActivity", logHelper.user(user), `Activity ${activityId}`, "Failed to auto-update FTP", ftpEx)
            }

            // Check for new records.
            stravaAthletes.checkActivityRecords(user, [activity])

            // Check and get recipes, sorted by the user-specified order.
            if (!user.recipes) {
                debugLogger("Strava.processActivity", logHelper.user(user), `Activity ${activityId}`, "User has no recipes to process")
                return null
            }
            let sortedRecipes: RecipeData[] = _.sortBy(Object.values(user.recipes), ["defaultFor", "order", "title"])

            // If PRO subscription was cancelled but user still have many recipes, consider just the first ones.
            if (!user.isPro && sortedRecipes.length > settings.plans.free.maxRecipes) {
                sortedRecipes = sortedRecipes.slice(0, settings.plans.free.maxRecipes)
            }

            // Evaluate each of user's recipes, and set update to true if something was processed.
            for (recipe of sortedRecipes) {
                try {
                    if (await recipes.evaluate(user, recipe.id, activity)) {
                        recipeIds.push(recipe.id)

                        if (recipe.killSwitch) {
                            debugLogger("Strava.processActivity", logHelper.user(user), `Activity ${activityId}`, `Recipe ${recipe.id} kill switch`)
                            break
                        }
                    }
                } catch (innerEx) {
                    logger.error("Strava.processActivity", logHelper.user(user), `Activity ${activityId}`, logHelper.recipe(recipe), innerEx)
                }
            }

            // Activity updated? Save to Strava and increment activity counter.
            if (recipeIds.length > 0) {
                const actions = []
                recipeIds.forEach((rid) => user.recipes[rid].actions.forEach((a) => actions.push(a.type)))

                logger.info("Strava.processActivity", logHelper.user(user), `Activity ${activityId}`, pActivity.queued ? "From queue" : "Realtime", `Recipes: ${recipeIds.join(", ")}`, `Actions: ${_.uniq(actions).join(", ")}`)

                // Remove duplicates from list of updated fields.
                activity.updatedFields = _.uniq(activity.updatedFields || [])

                // Write suspended (possibly missing permissions)? Stop here.
                if (user.writeSuspended) {
                    logger.warn("Strava.processActivity", logHelper.user(user), `Activity ${activityId}`, "User.writeSuspended, won't update the activity")
                    return null
                }

                // Save to Strava!
                try {
                    await stravaActivities.setActivity(user, activity)
                    cache.set("processed-activities", activity.id, activity.dateStart)
                } catch (ex) {
                    logger.error("Strava.processActivity", logHelper.user(user), `Activity ${activityId}`, ex)
                    saveError = ex.friendlyMessage || ex.message || ex

                    // Create notification for user in case the activity exists but could not be processed.
                    if (activity.dateEnd) {
                        try {
                            let aDate = dayjs(activity.dateEnd)
                            if (activity.utcStartOffset) {
                                aDate = aDate.add(activity.utcStartOffset, "minutes")
                            }

                            const title = `Failed to process activity ${activity.id}`
                            const body = `There was an error processing your ${activity.sportType} "${activity.name}", on ${aDate.format("lll")}. Strava returned an error message.`
                            const expiry = dayjs().add(14, "days").toDate()

                            await notifications.createNotification(user, {title: title, body: body, activityId: activity.id, dateExpiry: expiry})
                        } catch (innerEx) {
                            logger.warn("Strava.processActivity", `Failed creating notification for activity ${activityId}, from user ${user.id}`)
                        }
                    }
                }

                // Save processed activity to the database and update count on user data.
                try {
                    await users.setActivityCount(user)
                    user.activityCount++
                    return await this.saveProcessedActivity(user, activity, recipeIds, saveError)
                } catch (ex) {
                    logger.error("Strava.processActivity", logHelper.user(user), `Activity ${activityId}`, "Not saved to database", ex)
                    return null
                }
            }

            // No matching recipes but user has opted for AI features? We still need to save it so we can generate prompts using its data.
            if (user.preferences.aiEnabled) {
                logger.info("Strava.processActivity", logHelper.user(user), `Activity ${activityId}`, pActivity.queued ? "From queue" : "Realtime", "No matching recipes, but will save data for AI insights")
                return await this.saveProcessedActivity(user, activity)
            }

            logger.info("Strava.processActivity", logHelper.user(user), `Activity ${activityId}`, `No matching recipes, won't process`)
        } catch (ex) {
            logger.error("Strava.processActivity", logHelper.user(user), `Activity ${activityId}`, ex)
            throw ex
        }

        return null
    }

    /**
     * Save a processed activity with user and recipe details to the database.
     * @param user The activity's owner.
     * @param activity The Strava activity details.
     * @param recipeIds Array of triggered recipe IDs.
     * @param error If errored, this will contain the error details.
     */
    saveProcessedActivity = async (user: UserData, activity: StravaActivity, recipeIds?: string[], error?: string): Promise<StravaProcessedActivity> => {
        try {
            const data: StravaProcessedActivity = {
                id: activity.id,
                name: activity.name,
                dateProcessed: dayjs.utc().toDate(),
                userId: user.id
            }

            // Get updated fields.
            if (activity.updatedFields?.length > 0) {
                let updatedFields = {}
                for (let field of activity.updatedFields) {
                    if (field == "gear") {
                        updatedFields[field] = activity.gear.id == "none" ? "None" : `${activity.gear.name} (${activity.gear.id})`
                    } else {
                        updatedFields[field] = activity[field]
                    }
                }
                data.updatedFields = updatedFields
            }

            // Get recipe summary.
            if (recipeIds?.length > 0) {
                let recipeDetails = {}
                recipeIds?.forEach((id) => {
                    recipeDetails[id] = {
                        title: user.recipes[id].title,
                        conditions: _.map(user.recipes[id].conditions, getConditionSummary),
                        actions: _.map(user.recipes[id].actions, getActionSummary)
                    }
                })
                data.recipes = recipeDetails
            }

            // Extra activity details in case user has not opted for the privacy mode.
            // Even more details if user has opted in for the AI features.
            if (!user.preferences.privacyMode) {
                const mainFields = ["sportType", "name", "dateStart", "utcStartOffset", "totalTime", "movingTime", "distance", "distanceUnit", "device", "newRecords"]
                _.assign(data, _.pick(activity, mainFields))

                if (user.preferences.aiEnabled) {
                    const extraFields = ["elevationGain", "elevationUnit", "speedAvg", "speedMax", "wattsAvg", "wattsWeighted", "wattsMax", "wattsKg", "hrAvg", "hrMax", "cadenceAvg", "tss", "weatherSummary"]
                    _.assign(data, _.pick(activity, extraFields))

                    // Weather summaries are not available for batch processed activities.
                    if (!activity.weatherSummary && !activity.batch) {
                        const weatherSummary = await weather.getActivityWeather(user, activity, false)
                        const anySummary = weatherSummary?.mid || weatherSummary?.start || weatherSummary?.end
                        if (anySummary) {
                            activity.weatherSummary = weatherSummaryString(anySummary)
                        }
                    }
                }
            }

            // Backlink added to activity?
            if (activity.backlink) {
                logger.info("Strava.backlink", logHelper.user(user), logHelper.activity(activity))
                data.backlink = true
            }

            // Make sure error is a string (if an error was passed).
            if (error) {
                data.error = error.toString()
            }

            // Save and return result. Empty processed values are removed before saving.
            await database.set("activities", _.omitBy(data, _.isNil), activity.id.toString())
            logger.debug("Strava.saveProcessedActivity", data)

            // Dispatch processed event and return saved data.
            eventManager.emit("Strava.activityProcessed", user, activity)

            return data
        } catch (ex) {
            logger.error("Strava.saveProcessedActivity", logHelper.user(user), logHelper.activity(activity), ex)
            throw ex
        }
    }

    /**
     * Delete all saved / processed activities for the specified user and / or max age.
     * At least one argument is required. Returns the number of deleted activities.
     * @param user Optional user account.
     * @param ageDays Optional max age (in days).
     */
    deleteProcessedActivities = async (user?: UserData | null, ageDays?: number): Promise<number> => {
        if (!user && !ageDays) {
            throw new Error("At least a user or a max age in days is necessary")
        }

        if (!ageDays) ageDays = 0

        const userLog = user ? logHelper.user(user) : "All users"
        const sinceLog = ageDays > 0 ? `Older than ${ageDays} days` : "Since the beginning"
        const where: any[] = []

        try {
            if (user) {
                where.push(["userId", "==", user.id])
            }
            if (ageDays > 0) {
                const maxDate = dayjs().subtract(ageDays, "days").toDate()
                where.push(["dateProcessed", "<", maxDate])
            }

            // At least a user or age must be passed.
            if (where.length == 0) {
                throw new Error("A user or an ageDays must be passed")
            }

            const count = await database.delete("activities", where)
            logger.info("Strava.deleteProcessedActivities", userLog, sinceLog, `Deleted ${count || "no"} activities`)

            return count
        } catch (ex) {
            logger.error("Strava.deleteProcessedActivities", userLog, sinceLog, ex)
            return 0
        }
    }

    // ACTIVITY QUEUE
    // --------------------------------------------------------------------------

    /**
     * Add activity to the collection of activities to be processed later.
     * @param user The activity's owner (user).
     * @param activityId The activity's unique ID.
     * @param batch Queued as part of a batch processing for old activities?
     * @param error Queued because of a processing error?
     */
    queueActivity = async (user: UserData, activityId: number, batch?: boolean, error?: any): Promise<void> => {
        if (user.suspended) {
            logger.warn("Strava.queueActivity", logHelper.user(user), `User suspended, won't process activity ${activityId}`)
            return
        }

        // Add the activity to the queue to be processed on the next batch.
        // If the activity was already queued then keep the original dateQueued.
        try {
            let activity: Partial<StravaProcessedActivity> = await database.get("activities", activityId.toString())
            let existing = activity ? true : false

            // Set processed activity defaults.
            if (!activity) activity = {}
            activity.id = activityId
            activity.userId = user.id
            activity.dateQueued = activity.dateQueued || new Date()

            // Part of a batch processing? Flag it.
            if (batch) {
                activity.batch = true
            }

            // Previously failed due to an error? Set it.
            if (error) {
                activity.error = error
            }

            await database.set("activities", activity, activityId.toString())

            if (existing) {
                logger.warn("Strava.queueActivity", logHelper.user(user), `Activity ${activityId} already queued or processed`)
            } else {
                logger.info("Strava.queueActivity", logHelper.user(user), `Activity ${activityId} queued`)
            }
        } catch (ex) {
            logger.error("Strava.queueActivity", logHelper.user(user), `Activity ${activityId}`, ex)
            throw ex
        }
    }

    /**
     * Get queued activities, with an optional minimum interval.
     * @param beforeDate Only get activities that were queued before that specified date.
     * @param batchSize Optional batch size, otherwise use the default from settings.
     */
    getQueuedActivities = async (beforeDate: Date, batchSize?: number): Promise<StravaProcessedActivity[]> => {
        const logDate = `Before ${dayjs(beforeDate).format("lll")}`
        if (!batchSize) batchSize = settings.strava.processingQueue.batchSize

        // Get queued activities from the database.
        try {
            const where = [["dateQueued", "<=", beforeDate]]
            const activities: StravaProcessedActivity[] = await database.search("activities", where, "dateQueued", batchSize)

            if (activities.length > 0) {
                logger.info("Strava.getQueuedActivities", logDate, `Batch size: ${batchSize}`, `Got ${activities.length} queued activities`)
                return activities
            }

            // If no recent activities were returned, check if we have older activities as part of batch processing?
            const batchWhere = [["batch", "==", true]]
            const batchActivities = await database.search("activities", batchWhere, null, batchSize)

            const batchLog = batchActivities.length > 0 ? `${batchActivities.length} batch activities` : "no queued or batch activities"
            logger.info("Strava.getQueuedActivities", logDate, `Batch size: ${batchSize}`, `Got ${batchLog}`)

            return batchActivities
        } catch (ex) {
            logger.error("Strava.getQueuedActivities", logDate, `Batch size: ${batchSize}`, ex)
        }
    }

    /**
     * Get and process queued (delayed processing) activities.
     * @param batchSize Optional batch size, otherwise use the default from settings (10 activities).
     */
    processQueuedActivities = async (batchSize?: number): Promise<void> => {
        const usersCache: {[id: string]: UserData} = {}
        if (!batchSize) batchSize = settings.strava.processingQueue.batchSize
        const logBatchSize = `Batch size: ${batchSize}`

        try {
            const now = dayjs()
            const processingCutDate = now.subtract(settings.strava.processingQueue.maxAge / 2, "seconds").toDate()
            const beforeDate = now.subtract(settings.strava.processingQueue.delayedSeconds, "seconds").toDate()
            const queuedActivities = await this.getQueuedActivities(beforeDate, batchSize)

            // Filter activities that are not currently being processed, or that have been queued for at least
            // half of the maximum allowed queue age regardless of the processing flag.
            const activities = queuedActivities.filter((a) => !a.processing || a.dateQueued < processingCutDate)
            let processedCount = 0

            // No activities to be processed? Stop here.
            if (activities.length == 0) {
                logger.debug("Strava.processQueuedActivities", logBatchSize, "No queued activities to be processed")
                return
            }

            // Check if we have activities from that batch which are already being processed by another job.
            const skipped = queuedActivities.length - activities.length
            const skipLog = skipped > 0 ? `, skipping ${skipped} already processing` : ""
            logger.info("Strava.processQueuedActivities", logBatchSize, `Will process ${activities.length} activities${skipLog}`)

            // First we set the processing flag on the queued activities to avoid double-processing.
            for (let activity of activities) {
                try {
                    if (_.isNil(activity.retryCount)) {
                        activity.retryCount = 0
                    }

                    await database.merge("activities", {id: activity.id, processing: true})
                } catch (innerEx) {
                    logger.error("Strava.processQueuedActivities", `Failed to set the processing flag for activity ${activity.id} from user ${activity.userId}`, innerEx)
                }
            }

            // Now we process each of the queued activities separately.
            for (let pActivity of activities) {
                try {
                    if (!usersCache[pActivity.userId]) {
                        usersCache[pActivity.userId] = await users.getById(pActivity.userId)
                    }

                    const processed = await this.processActivity(usersCache[pActivity.userId], pActivity)

                    // Queued activity is invalid or had no matching recipes? Delete it.
                    if (!processed) {
                        await this.deleteQueuedActivity(pActivity)
                    } else {
                        processedCount++
                    }
                } catch (activityEx) {
                    if (pActivity.retryCount >= settings.strava.processingQueue.retry) {
                        logger.warn("Strava.processQueuedActivities", `Failed to process queued activity ${pActivity.id} from user ${pActivity.userId} too many times`)
                        await this.deleteQueuedActivity(pActivity)
                    } else {
                        logger.warn("Strava.processQueuedActivities", `Failed to process queued activity ${pActivity.id} from user ${pActivity.userId}, will retry`)
                        await database.merge("activities", {id: pActivity.id, processing: false, retryCount: pActivity.retryCount + 1})
                    }
                }
            }

            if (processedCount > 0) {
                logger.info("Strava.processQueuedActivities", logBatchSize, `Processed ${processedCount} out of ${activities.length} queued activities`)
            } else {
                logger.debug("Strava.processQueuedActivities", logBatchSize, `No processed activities out of ${activities.length} queued activities`)
            }
        } catch (ex) {
            logger.error("Strava.processQueuedActivities", logBatchSize, ex)
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
                logger.info("Strava.deleteQueuedActivity", `User ${activity.userId}`, `${logHelper.activity(activity)} deleted`)
            } else {
                logger.warn("Strava.deleteQueuedActivity", `User ${activity.userId}`, `${logHelper.activity(activity)} not previously saved`)
            }
        } catch (ex) {
            logger.error("Strava.deleteQueuedActivity", `User ${activity.userId}`, logHelper.activity(activity), ex)
            throw ex
        }
    }
}

// Exports...
export default StravaActivityProcessing.Instance
