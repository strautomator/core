// Strautomator Core: GearWear

import {GearWearDbState, GearWearConfig, GearWearComponent} from "./types"
import {getBatteryTracker, updateBatteryTracker, deleteBatteryTrackerDevice} from "./battery"
import {notifyIdle} from "./notifications"
import {resetTracking, updateTracking} from "./tracking"
import {StravaActivity, StravaGear} from "../strava/types"
import {UserData} from "../users/types"
import {FieldValue} from "@google-cloud/firestore"
import database from "../database"
import eventManager from "../eventmanager"
import strava from "../strava"
import users from "../users"
import _ from "lodash"
import cache from "bitecache"
import logger from "anyhow"
import * as logHelper from "../loghelper"
import dayjs from "../dayjs"
const settings = require("setmeup").settings

/**
 * Evaluate and process automation recipes.
 */
export class GearWear {
    private constructor() {}
    private static _instance: GearWear
    static get Instance() {
        return this._instance || (this._instance = new this())
    }

    // Exported helper methods.
    notifyIdle = notifyIdle
    resetTracking = resetTracking
    updateTracking = updateTracking
    getBatteryTracker = getBatteryTracker
    updatedBatteryTracker = updateBatteryTracker
    deleteBatteryTrackerDevice = deleteBatteryTrackerDevice

    // INIT
    // --------------------------------------------------------------------------

    /**
     * Init the GearWear Manager.
     */
    init = async () => {
        try {
            if (settings.gearwear.delayDays < 1) {
                throw new Error(`The gearwear.delayDays must be at least 1 (which means yesterday)`)
            }
            if (settings.gearwear.reminderThreshold <= 1) {
                throw new Error(`The gearwear.reminderThreshold setting must be higher than 1`)
            }

            const state: GearWearDbState = await database.appState.get("gearwear")

            if (state && state.dateLastProcessed) {
                const lastDate = dayjs.utc(state.dateLastProcessed)

                // Make sure the processing flag is not stuck due to whatever reason.
                if (state.processing) {
                    const minDate = dayjs.utc().subtract(25, "hours")

                    if (lastDate.isBefore(minDate)) {
                        await database.appState.set("gearwear", {processing: false})
                        logger.warn("GearWear.init", `Stuck processing since ${lastDate.format("lll")}`, `Setting processing=false now`)
                    }
                } else {
                    logger.info("GearWear.init", `Last processed at ${lastDate.format("lll")}, ${state.recentActivityCount} activities`)
                }
            }
        } catch (ex) {
            logger.error("GearWear.init", ex)
        }

        eventManager.on("Strava.activityUpdated", this.onStravaActivityUpdated)
        eventManager.on("Strava.activityDeleted", this.onStravaActivityDeleted)
        eventManager.on("Strava.activityProcessed", this.onStravaActivityProcessed)
        eventManager.on("Users.delete", this.onUserDelete)
        eventManager.on("Users.switchToFree", this.onUserSwitchToFree)
    }

    /**
     * Rollback GearWear tracking if an activity was updated with a different gear. Will only proceed if user is PRO.
     * @param user The user owning the activity.
     * @param activityId The ID of the updated activity.
     */
    private onStravaActivityUpdated = async (user: UserData, activityId: number): Promise<void> => {
        const debugLogger = user.debug ? logger.warn : logger.debug
        if (!user.isPro) return

        try {
            const recentCached = cache.get("processed-activities", activityId)

            // Check if it wasn't a recent update triggered by a recent automation. If so, stop right here,
            // otherwise proceed to fetch the live activity data.
            if (recentCached) {
                debugLogger("GearWear.onStravaActivityUpdated", logHelper.user(user), activityId, "Update webhook event likely due to an update made by Strautomator, will not proceed")
                return
            }

            const activity = await strava.activities.getActivity(user, activityId)
            if (!activity?.gear) {
                debugLogger("GearWear.onStravaActivityUpdated", logHelper.user(user), activityId, "Could not fetch activity gear details, abort")
                return
            }

            // Get the current gear set on the activity and find the previous config (if any) that had this activity tracked.
            const config = activity.gear?.id ? await this.getById(activity.gear.id) : null
            const previousConfig = await this.getByActivityId(user, activityId)
            if ((!config && !previousConfig) || config?.id == previousConfig?.id) {
                debugLogger("GearWear.onStravaActivityUpdated", logHelper.user(user), activityId, "No gear config to be updated")
                return
            }

            // Rollback the previous and update the current config, if needed.
            if (previousConfig && previousConfig?.id != activity.gear.id) {
                await updateTracking(user, previousConfig, [activity], true)
            }
            if (config && !config.recentActivities?.includes(activity.id)) {
                await updateTracking(user, config, [activity])
            }
        } catch (ex) {
            logger.error("GearWear.onStravaActivityUpdated", logHelper.user(user), activityId, ex)
        }
    }

    /**
     * Rollback GearWear tracking if an activity was deleted. Will only proceed if user is PRO.
     * @param user The user owning the activity.
     * @param activityId The ID of the deleted activity.
     */
    private onStravaActivityDeleted = async (user: UserData, activityId: number): Promise<void> => {
        const debugLogger = user.debug ? logger.warn : logger.debug
        if (!user.isPro) return

        try {
            const config = await this.getByActivityId(user, activityId)
            if (!config) {
                return
            }

            // GearWear config found so we'll try to get the previous activity details from a saved processed activity.
            const processedActivity = await strava.activityProcessing.getProcessedActivity(user, activityId)
            if (!processedActivity) {
                debugLogger("GearWear.onStravaActivityDeleted", logHelper.user(user), activityId, `No processed activity found, cannot rollback tracking for gear ${config.id}`)
                return
            }

            // Emulate an existing activity and rollback the tracking for the deleted activity.
            const activity: StravaActivity = _.pick(processedActivity, ["id", "name", "dateStart", "distance", "totalTime", "movingTime", "type", "gear"]) as StravaActivity
            await updateTracking(user, config, [activity], true)
        } catch (ex) {
            logger.error("GearWear.onStravaActivityDeleted", logHelper.user(user), activityId, ex)
        }
    }

    /**
     * Trigger the GearWear processing straight away for activities that had their gear changed.
     * Will only proceed if user is PRO and the gear of the activity was updated by an automation.
     * @param user The user owning the activity.
     * @param activity The Strava activity that was just processed.
     */
    private onStravaActivityProcessed = async (user: UserData, activity: StravaActivity): Promise<void> => {
        const debugLogger = user.debug ? logger.warn : logger.debug
        if (!user.isPro) return

        try {
            if (!activity.distance && !activity.movingTime) return
            if (!activity.updatedFields || !activity.updatedFields.includes("gear") || !activity.gear) return

            // First we check if the activity was previously tracked by another GearWear config,
            // and if so, rollback the tracking on that previous config.
            const previousConfig = await this.getByActivityId(user, activity.id)
            if (previousConfig) {
                if (previousConfig.id != activity.gear.id) {
                    debugLogger("GearWear.onStravaActivityProcessed", logHelper.user(user), logHelper.activity(activity), `Gear has changed from ${previousConfig.id} to ${activity.gear.id}`)
                    await updateTracking(user, previousConfig, [activity], true)
                } else {
                    debugLogger("GearWear.onStravaActivityProcessed", logHelper.user(user), logHelper.activity(activity), `Same gear ${previousConfig.id}, no further processing needed`)
                    return
                }
            }

            const config = await this.getById(activity.gear.id)
            if (!config) {
                return
            }

            // We found a matching GearWear config, so now we double check if the gear is still valid on the user's profile.
            const findId = {id: config.id}
            if (!_.find(user.profile.bikes, findId) && !_.find(user.profile.shoes, findId)) {
                logger.warn("GearWear.onStravaActivityProcessed", logHelper.user(user), logHelper.activity(activity), `Gear ${activity.gear.id} not found on user profile, abort`)
                return
            }

            // Gear is valid, proceed to update the tracking.
            await updateTracking(user, config, [activity])
        } catch (ex) {
            logger.error("GearWear.onStravaActivityProcessed", logHelper.user(user), logHelper.activity(activity), ex)
        }
    }

    /**
     * Delete user gearwear configs after it gets deleted from the database.
     * @param user User that was deleted from the database.
     */
    private onUserDelete = async (user: UserData): Promise<void> => {
        try {
            const counter = await database.delete("gearwear", ["userId", "==", user.id])
            const battery = await database.delete("gearwear-battery", ["userId", "==", user.id])

            if (counter > 0) {
                logger.info("GearWear.onUserDelete", logHelper.user(user), `Deleted ${counter} GearWear configurations`)
            }
            if (battery > 0) {
                logger.info("GearWear.onUserDelete", logHelper.user(user), `Deleted the battery tracker`)
            }
        } catch (ex) {
            logger.error("GearWear.onUserDelete", logHelper.user(user), ex)
        }
    }

    /**
     * Disable GearWear configurations outside the free plan limit.
     * @param user User that was downgraded to free.
     */
    private onUserSwitchToFree = async (user: UserData): Promise<void> => {
        try {
            const arrGearwear: GearWearConfig[] = await database.search("gearwear", ["userId", "==", user.id])

            if (arrGearwear.length > settings.plans.free.maxGearWear) {
                logger.info("GearWear.onUserSwitchToFree", logHelper.user(user), `Will disable ${arrGearwear.length - settings.plans.free.maxGearWear} GearWear configs`)

                for (let i = settings.plans.free.maxGearWear; i < arrGearwear.length; i++) {
                    const gw = arrGearwear[i]
                    try {
                        const existing = user.profile.bikes?.find((b) => b.id == gw.id) || user.profile.shoes?.find((s) => s.id == gw.id)

                        // Disable (or delete, if not found) GearWear over the free plan limit.
                        if (existing) {
                            gw.disabled = true
                            await this.upsert(user, gw)
                        } else {
                            await this.delete(gw)
                        }
                    } catch (innerEx) {
                        logger.error("GearWear.onUserSwitchToFree", logHelper.user(user), `Gear ${gw.id}`, innerEx)
                    }
                }
            }
        } catch (ex) {
            logger.error("GearWear.onUserSwitchToFree", logHelper.user(user), ex)
        }
    }

    // VALIDATION AND UTILS
    // --------------------------------------------------------------------------

    /**
     * Validate a GearWear configuration set by the user.
     * @param user The user object.
     * @param config The GearWear configuration.
     */
    validate = (user: UserData, config: GearWearConfig): void => {
        const debugLogger = user.debug ? logger.warn : logger.debug

        try {
            if (!config) {
                throw new Error("Gear wear config is empty")
            }

            if (!config.id) {
                throw new Error("Missing gear ID")
            }

            let gear = _.find(user.profile.bikes, {id: config.id}) || _.find(user.profile.shoes, {id: config.id})

            // Make sure gear still exists and the components were set.
            if (!gear) {
                throw new Error(`User has no gear ID ${config.id}`)
            }
            if (!config.components) {
                throw new Error("Missing gear components")
            }

            // Valid component fields.
            const validCompFields = ["name", "currentDistance", "currentTime", "alertDistance", "alertTime", "preAlertPercent", "datePreAlertSent", "dateAlertSent", "dateLastUpdate", "activityCount", "history", "disabled"]

            // Validate individual components.
            for (let comp of config.components) {
                if (comp.alertDistance > 0 && comp.alertDistance < 100) {
                    throw new Error("Minimum accepted alert distance is 100")
                }
                if (comp.alertTime > 0 && comp.alertTime < 72000) {
                    throw new Error("Minimum accepted alert time is 20 hours (72000)")
                }
                if (comp.preAlertPercent > 0 && comp.preAlertPercent < 50) {
                    throw new Error("Pre alert reminder minimum threshold is 50%")
                }

                // The disabled flag must be true or false.
                if (!_.isNil(comp.disabled)) {
                    comp.disabled = comp.disabled ? true : false
                }

                // Make sure the history array is present.
                if (!comp.history) {
                    comp.history = []
                } else if (!_.isArray(comp.history)) {
                    throw new Error("Component history must be an array")
                }

                // Date validation.
                if (!_.isDate(comp.dateLastUpdate)) {
                    const lastUpdate = dayjs(comp.dateLastUpdate || new Date())
                    comp.dateLastUpdate = lastUpdate.isValid() ? lastUpdate.toDate() : new Date()
                }

                // Remove non-relevant fields.
                const compFields = Object.keys(comp)
                for (let key of compFields) {
                    if (!validCompFields.includes(key)) {
                        logger.error("GearWear.validate", logHelper.user(user), `Gear ${config.id} - ${comp.name}`, `Removed invalid field: ${key}`)
                        delete comp[key]
                    }
                }
            }

            // Make sure the name is up-to-date.
            if (config.name != gear.name) {
                debugLogger("GearWear.validate", logHelper.user(user), `Gear ${config.id}, updated name from "${config.name || ""}" to "${gear.name}"`)
                config.name = gear.name
            }
        } catch (ex) {
            logger.error("GearWear.validate", logHelper.user(user), JSON.stringify(config, null, 0), ex)
            throw ex
        }
    }

    /**
     * Sort the components of the GearWear configuration, disabled components should come last.
     * @param config The GearWear config to be sorted.
     */
    sortComponents = (config: GearWearConfig): void => {
        if (config?.components?.length > 0) {
            config.components.forEach((comp) => (comp.disabled = comp.disabled || false))
            const sortedComponents = _.sortBy(config.components, ["disabled", "name"])
            config.components = sortedComponents
        }
    }

    // GET
    // --------------------------------------------------------------------------

    /**
     * Get all GearWear configurations that were updated since the specified date.
     * @param date Updated since date.
     */
    getUpdatedSince = async (date: dayjs.Dayjs): Promise<GearWearConfig[]> => {
        const logDate = `Since ${date.format("lll")}`

        try {
            const result: GearWearConfig[] = await database.search("gearwear", ["lastUpdate.date", ">", date])
            logger.info("GearWear.getUpdatedSince", logDate, `Got ${result.length} configurations`)
            return result
        } catch (ex) {
            logger.error("GearWear.getUpdatedSince", logDate, ex)
            throw ex
        }
    }

    /**
     * Get the GearWear by its ID.
     * @param id The ID of the GearWear to be fetched.
     */
    getById = async (id: string): Promise<GearWearConfig> => {
        try {
            const result: GearWearConfig = await database.get("gearwear", id)

            this.sortComponents(result)
            return result
        } catch (ex) {
            logger.error("GearWear.getById", id, ex)
            throw ex
        }
    }

    /**
     * Get list of GearWear configurations for the specified user.
     * @param user The user owner of the GearWear.
     * @param includeExpired Also return GearWear for deleted / expired gear?
     */
    getByUser = async (user: UserData, includeExpired?: boolean): Promise<GearWearConfig[]> => {
        try {
            const result: GearWearConfig[] = await database.search("gearwear", ["userId", "==", user.id])

            // If the includeExpired flag is not set, remove GearWear with no matching gear on Strava.
            if (!includeExpired) {
                const allGear = _.concat(user.profile.bikes || [], user.profile.shoes || [])
                _.remove(result, (g) => !_.find(allGear, {id: g.id}))
                logger.info("GearWear.getByUser", logHelper.user(user), `${result.length} active GearWear configurations`)
            } else {
                logger.info("GearWear.getByUser", logHelper.user(user), `${result.length} total GearWear configurations`)
            }

            // Set gear name and sort components.
            result.forEach((config) => {
                const gear = user.profile.bikes?.find((b) => b.id == config.id) || user.profile.shoes?.find((s) => s.id == config.id)
                config.name = gear?.name || "RETIRED GEAR"
                this.sortComponents(config)
            })

            return result
        } catch (ex) {
            logger.error("GearWear.getByUser", logHelper.user(user), ex)
            throw ex
        }
    }

    /**
     * Get the GearWear by a recent activity ID.
     * @param user The user owner of the GearWear.
     * @param activityId The ID of the activity.
     */
    getByActivityId = async (user: UserData, activityId: number): Promise<GearWearConfig> => {
        const debugLogger = user.debug ? logger.warn : logger.debug

        try {
            const configs: GearWearConfig[] = await database.search("gearwear", ["recentActivities", "array-contains", activityId])
            if (configs.length == 0) {
                debugLogger("GearWear.getByActivityId", logHelper.user(user), activityId, "No matching config found")
                return null
            }

            // Only 1 matching GearWear for an activity expected. Alert if that's not the case.
            if (configs.length > 1) {
                logger.warn("GearWear.getByActivityId", logHelper.user(user), activityId, `Multiple configs found: ${_.map(configs, "id").join(", ")}`)
            }

            return configs.shift()
        } catch (ex) {
            logger.error("GearWear.getByActivityId", logHelper.user(user), activityId, ex)
            throw ex
        }
    }

    // UPDATE AND DELETE
    // --------------------------------------------------------------------------

    /**
     * Refresh the details for all bikes and shoes for the user.
     * @param user The user.
     */
    refreshGearDetails = async (user: UserData): Promise<void> => {
        try {
            const newData: any = {id: user.id, profile: {}}
            let gearCount = 0

            // If user has bikes, update the details for all of them.
            if (user.profile.bikes.length > 0) {
                newData.profile.bikes = []

                for (let gear of user.profile.bikes) {
                    try {
                        const bike = await strava.athletes.getGear(user, gear.id)
                        _.assign(gear, bike)
                        gearCount++
                    } catch (ex) {
                        logger.error("Users.refreshGearDetails", user.id, user.displayName, `Could no refresh bike ${gear.id} - ${gear.name}`)
                    }

                    newData.profile.bikes.push(gear)
                }
            }

            // And do the same for shoes.
            if (user.profile.shoes.length > 0) {
                newData.profile.shoes = []

                for (let gear of user.profile.shoes) {
                    try {
                        const shoes = await strava.athletes.getGear(user, gear.id)
                        _.assign(gear, shoes)
                        gearCount++
                    } catch (ex) {
                        logger.error("Users.refreshGearDetails", user.id, user.displayName, `Could no refresh shoes ${gear.id} - ${gear.name}`)
                    }

                    newData.profile.shoes.push(gear)
                }
            }

            // Update changes to the database.
            if (gearCount > 0) {
                await database.merge("users", newData)
                logger.info("Users.refreshGearDetails", user.id, user.displayName, `Refreshed ${gearCount} gear details`)
            }
        } catch (ex) {
            logger.error("Users.refreshGearDetails", user.id, user.displayName, ex)
        }
    }

    /**
     * Create or update a GearWear config.
     * @param user The user owner of the gear.
     * @param config The GearWear configuration.
     * @param toggledComponents Optional in case of toggling components, which components were toggled? Used for logging only.
     */
    upsert = async (user: UserData, config: GearWearConfig, toggledComponents?: GearWearComponent[]): Promise<GearWearConfig> => {
        const doc = database.doc("gearwear", config.id)
        let action: string

        try {
            const docSnapshot = await doc.get()
            const exists = docSnapshot.exists
            action = config.disabled ? "Disabled" : exists ? "Updated" : "Created"

            const bike = _.find(user.profile.bikes, {id: config.id})
            const shoe = _.find(user.profile.shoes, {id: config.id})
            const gear: StravaGear = bike || shoe

            if (!gear) {
                if (exists) {
                    config.disabled = true
                }

                throw new Error(`Gear ${config.id} does not exist`, {cause: {status: 404}})
            }

            // Validate configuration before proceeding.
            this.validate(user, config)

            // Save to the database.
            await database.merge("gearwear", config, doc)

            // Details to be logged depending on toggled components.
            const logDetails = toggledComponents ? toggledComponents.map((c) => `${c.name}: ${c.disabled ? "disabled" : "enabled"}`) : `Components: ${_.map(config.components, "name").join(", ")}`
            logger.info("GearWear.upsert", logHelper.user(user), `${action} ${config.id} - ${gear.name}`, logDetails)

            return config
        } catch (ex) {
            if (doc && ex.cause?.status == 404) {
                try {
                    await database.merge("gearwear", config, doc)
                    logger.error("GearWear.upsert", logHelper.user(user), `Gear ${config.id} not found, will disable its GearWear`)
                } catch (innerEx) {
                    logger.error("GearWear.upsert", logHelper.user(user), `Gear ${config.id}`, innerEx)
                }
            } else {
                logger.error("GearWear.upsert", logHelper.user(user), `Gear ${config.id}`, ex)
            }

            throw ex
        }
    }

    /**
     * Re-enable a disabled GearWear configuration.
     * @param user The user.
     * @param config GearWear to be re-enabled.
     */
    reEnable = async (user: UserData, config: GearWearConfig): Promise<void> => {
        try {
            if (!config.disabled) {
                logger.warn("GearWear.reEnable", logHelper.user(user), logHelper.gearwearConfig(user, config), "Not disabled, can't re-enable it")
                return
            }

            await database.merge("gearwear", {id: config.id, disabled: FieldValue.delete() as any})
            logger.info("GearWear.reEnable", logHelper.user(user), logHelper.gearwearConfig(user, config), "Re-enabled")
        } catch (ex) {
            logger.error("GearWear.reEnable", logHelper.user(user), logHelper.gearwearConfig(user, config), ex)
            throw ex
        }
    }

    /**
     * Delete the specified GearWear configuration.
     * @param config GearWear to be deleted.
     */
    delete = async (config: GearWearConfig): Promise<void> => {
        try {
            await database.doc("gearwear", config.id).delete()
            logger.warn("GearWear.delete", `User ${config.userId}`, `Gear ${config.id} configuration deleted`)
        } catch (ex) {
            logger.error("GearWear.delete", `User ${config.userId}`, `Gear ${config.id}`, ex)
            throw ex
        }
    }

    // ACTIVITY PROCESSING
    // --------------------------------------------------------------------------

    /**
     * Process recent activities for all users that have GearWear configurations defined.
     */
    processRecentActivities = async (): Promise<void> => {
        try {
            let state: GearWearDbState = await database.appState.get("gearwear")

            let today = dayjs.utc()
            let lastRunDate: dayjs.Dayjs = today.subtract(1, "year")

            // First we check if method is currently processing or if it already ran successfully today.
            // If so, log a warning and abort execution.
            if (state) {
                if (state.processing) {
                    logger.warn("GearWear.processRecentActivities", "Abort, another execution has already started")
                    return
                }

                if (state.dateLastProcessed) {
                    lastRunDate = dayjs.utc(state.dateLastProcessed)

                    if (lastRunDate.dayOfYear() == today.dayOfYear() && state.recentActivityCount > 0) {
                        logger.info("GearWear.processRecentActivities", `Already processed ${state.recentActivityCount} activities today`)
                        return
                    }
                }
            }

            // Set processing flag.
            await database.appState.set("gearwear", {processing: true})

            // Count how many activities were processed for all users on this execution.
            let activityCount = 0
            let userCount = 0

            // Get all GearWear configurations from the database,
            // and generate an array with all the user IDs.
            const gearwearList = await database.search("gearwear", null, ["userId", "asc"])
            const userIds = _.uniq(_.map(gearwearList, "userId"))

            // Helper function to process GearWear for the specified user.
            const processForUser = async (userId: string) => {
                try {
                    const user = await users.getById(userId)
                    if (user.suspended) {
                        logger.warn("GearWear.processRecentActivities", logHelper.user(user), "User is suspended, abort")
                        return
                    }

                    // Get activities timespan.
                    const days = isNaN(user.preferences.gearwearDelayDays) ? settings.gearwear.delayDays : user.preferences.gearwearDelayDays
                    let dateBefore = today.subtract(days, "days").endOf("day")
                    let dateAfter = today.subtract(days, "days").startOf("day")

                    // If the processing hasn't ran in a while, use its last run date instead.
                    if (dateAfter.isAfter(lastRunDate.subtract(settings.gearwear.delayDays))) {
                        dateAfter = lastRunDate
                    }

                    // Recent activities for the user? Update counters.
                    if (dateAfter.isBefore(user.dateLastActivity)) {
                        const userGears = _.remove(gearwearList, {userId: userId})
                        const userActivityCount = await this.processUserActivities(user, userGears, dateAfter, dateBefore)

                        activityCount += userActivityCount
                        userCount++
                    }
                } catch (userEx) {
                    logger.error("GearWear.processRecentActivities", `Failed to process for user ${userId}`)
                }
            }

            // Process GearWear for users in batches.
            const batchSize = settings.functions.batchSize
            while (userIds.length) {
                await Promise.allSettled(userIds.splice(0, batchSize).map(processForUser))
            }

            // Save gearwear state to the database.
            state = {
                recentActivityCount: activityCount,
                recentUserCount: userCount,
                dateLastProcessed: today.toDate(),
                processing: false
            }

            await database.appState.set("gearwear", state)
            logger.info("GearWear.processRecentActivities", `Processed ${state.recentActivityCount} activities for ${state.recentUserCount} users`)
        } catch (ex) {
            await database.appState.set("gearwear", {processing: false})
            logger.error("GearWear.processRecentActivities", ex)
        }
    }

    /**
     * Process recent activities for the specified user and increase the relevant GearWear distance.
     * Returns the number of processed activities for the user.
     * @param user The user to fetch activities for.
     * @param configs List of GearWear configurations.
     * @param dDateFrom Get activities that occurred after this timestamp.
     * @param dDateTo Get activities that occurred before this timestamp.
     */
    processUserActivities = async (user: UserData, configs: GearWearConfig[], dDateFrom: dayjs.Dayjs, dDateTo: dayjs.Dayjs): Promise<number> => {
        const debugLogger = user.debug ? logger.warn : logger.debug

        let dateString = `${dDateFrom.format("ll")} to ${dDateTo.format("ll")}`
        let count = 0

        // User suspended? Stop here.
        if (user.suspended) {
            logger.warn("GearWear.processUserActivities", logHelper.user(user), dateString, "User suspended, won't process")
            return 0
        }

        try {
            const inputActivities = await strava.activities.getActivities(user, {after: dDateFrom, before: dDateTo})
            const activities = _.sortBy(inputActivities, "dateStart")

            // No recent activities found? Stop here.
            if (activities.length == 0) {
                logger.info("GearWear.processUserActivities", logHelper.user(user), dateString, "No activities to process")
                return 0
            }

            logger.info("GearWear.processUserActivities", logHelper.user(user), dateString, `Processing ${activities.length} activities`)

            // Iterate user's active gearwear configurations and process activities for each one of them.
            const activeConfigs = configs.filter((c) => !c.disabled)
            for (let config of activeConfigs) {
                const findId = {id: config.id}
                let foundGear = (_.find(user.profile.bikes || [], findId) || _.find(user.profile.shoes || [], findId)) as StravaGear

                // Make sure the gear is still valid on the user profile.
                if (!foundGear) {
                    const athlete = await strava.athletes.getAthlete(user.stravaTokens)
                    foundGear = (_.find(athlete.bikes || [], findId) || _.find(athlete.shoes || [], findId)) as StravaGear
                    if (!foundGear) {
                        await database.merge("gearwear", {id: config.id, disabled: true})
                        eventManager.emit("GearWear.gearNotFound", user, config)
                        logger.warn("GearWear.processUserActivities", logHelper.user(user), `Gear ${config.id} not found on user profile, disabled it`)
                        continue
                    } else {
                        logger.info("GearWear.processUserActivities", logHelper.user(user), `Gear ${config.id} found on refreshed athlete details`)
                    }
                }

                // Make sure the gear name is up-to-date.
                if (config.name != foundGear.name) {
                    logger.info("GearWear.processUserActivities", logHelper.user(user), `Gear ${config.id}, updated name from "${config.name || ""}" to "${foundGear.name}"`)
                    config.name = foundGear.name
                }

                // Filter only activities for the current gear.
                const gearActivities = _.filter(activities, (a: StravaActivity) => (a.distance || a.movingTime) && a.gear?.id == config.id)

                // Double check if the activities were previously set to another gear config. If that's the case, rollback the tracking.
                const previousConfig = configs.find((c) => c.recentActivities?.find((a) => gearActivities.some((ga) => ga.id == a)))
                if (previousConfig && previousConfig.id != config.id) {
                    const previousActivities = activities.filter((a) => previousConfig.recentActivities?.includes(a.id))
                    await updateTracking(user, previousConfig, previousActivities, true)
                }

                // Get updated activities for the current gear and do the tracking.
                const updatedActivities = gearActivities.filter((a) => !config.recentActivities?.includes(a.id))
                if (updatedActivities.length > 0) {
                    await updateTracking(user, config, updatedActivities)
                    count += gearActivities.length
                } else {
                    debugLogger("GearWear.processUserActivities", logHelper.user(user), dateString, `No updated activities for gear ${config.id} - ${config.name}`)
                }
            }
        } catch (ex) {
            logger.error("GearWear.processUserActivities", logHelper.user(user), dateString, ex)
        }

        // Iterate all GearWear configurations and remove the updating flag (if it was set).
        for (let config of configs) {
            try {
                if (config.updating) {
                    config.updating = false
                    await database.set("gearwear", config, config.id)
                }
            } catch (ex) {
                logger.error("GearWear.processUserActivities", logHelper.user(user), dateString, `Gear ${config.id}`, ex)
            }
        }

        return count
    }
}

// Exports...
export default GearWear.Instance
