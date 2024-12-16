// Strautomator Core: GearWear

import {GearWearDbState, GearWearConfig, GearWearComponent, GearWearBatteryTracker} from "./types"
import {updateBatteryTracking} from "./battery"
import {notifyIdle} from "./notifications"
import {resetTracking, updateTracking} from "./tracking"
import {StravaActivity, StravaGear} from "../strava/types"
import {UserData} from "../users/types"
import database from "../database"
import eventManager from "../eventmanager"
import strava from "../strava"
import users from "../users"
import _ from "lodash"
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

        eventManager.on("Users.delete", this.onUserDelete)
        eventManager.on("Users.switchToFree", this.onUserSwitchToFree)
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
     * @param gearwear The GearWear configuration.
     */
    validate = (user: UserData, gearwear: GearWearConfig): void => {
        try {
            if (!gearwear) {
                throw new Error("Gear wear config is empty")
            }

            if (!gearwear.id) {
                throw new Error("Missing gear ID")
            }

            let gear = _.find(user.profile.bikes, {id: gearwear.id}) || _.find(user.profile.shoes, {id: gearwear.id})

            // Make sure the components were set.
            if (!gear) {
                throw new Error(`User has no gear ID ${gearwear.id}`)
            }
            if (!gearwear.components) {
                throw new Error("Missing gear components")
            }

            // Valid component fields.
            const validCompFields = ["name", "currentDistance", "currentTime", "alertDistance", "alertTime", "preAlertPercent", "datePreAlertSent", "dateAlertSent", "dateLastUpdate", "activityCount", "history", "disabled"]

            // Validate individual components.
            for (let comp of gearwear.components) {
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
                        logger.error("GearWear.validate", logHelper.user(user), `Gear ${gearwear.id} - ${comp.name}`, `Removed invalid field: ${key}`)
                        delete comp[key]
                    }
                }
            }
        } catch (ex) {
            logger.error("GearWear.validate", logHelper.user(user), JSON.stringify(gearwear, null, 0), ex)
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
     * Get the devices battery tracker for the specified user.
     * @param user The user.
     */
    getBatteryTracker = async (user: UserData): Promise<GearWearBatteryTracker> => {
        try {
            const result: GearWearBatteryTracker = await database.get("gearwear-battery", user.id)
            return result
        } catch (ex) {
            logger.error("GearWear.getBatteryTracker", logHelper.user(user), ex)
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
     * @param gearwear The GearWear configuration.
     * @param toggledComponents Optional in case of toggling components, which components were toggled? Used for logging only.
     */
    upsert = async (user: UserData, gearwear: GearWearConfig, toggledComponents?: GearWearComponent[]): Promise<GearWearConfig> => {
        const doc = database.doc("gearwear", gearwear.id)
        let action: string

        try {
            const docSnapshot = await doc.get()
            const exists = docSnapshot.exists
            action = gearwear.disabled ? "Disabled" : exists ? "Updated" : "Created"

            const bike = _.find(user.profile.bikes, {id: gearwear.id})
            const shoe = _.find(user.profile.shoes, {id: gearwear.id})
            const gear: StravaGear = bike || shoe

            if (!gear) {
                if (exists) {
                    gearwear.disabled = true
                }

                throw new Error(`Gear ${gearwear.id} does not exist`, {cause: {status: 404}})
            }

            // Validate configuration before proceeding.
            this.validate(user, gearwear)

            // Save to the database.
            await database.merge("gearwear", gearwear, doc)

            // Details to be logged depending on toggled components.
            const logDetails = toggledComponents ? toggledComponents.map((c) => `${c.name}: ${c.disabled ? "disabled" : "enabled"}`) : `Components: ${_.map(gearwear.components, "name").join(", ")}`
            logger.info("GearWear.upsert", logHelper.user(user), `${action} ${gearwear.id} - ${gear.name}`, logDetails)

            return gearwear
        } catch (ex) {
            if (doc && ex.cause?.status == 404) {
                try {
                    await database.merge("gearwear", gearwear, doc)
                    logger.error("GearWear.upsert", logHelper.user(user), `Gear ${gearwear.id} not found, will disable its GearWear`)
                } catch (innerEx) {
                    logger.error("GearWear.upsert", logHelper.user(user), `Gear ${gearwear.id}`, innerEx)
                }
            } else {
                logger.error("GearWear.upsert", logHelper.user(user), `Gear ${gearwear.id}`, ex)
            }

            throw ex
        }
    }

    /**
     * Delete the specified GearWear configuration.
     * @param user GearWear to be deleted.
     */
    delete = async (gearwear: GearWearConfig): Promise<void> => {
        try {
            await database.doc("gearwear", gearwear.id).delete()
            logger.warn("GearWear.delete", `User ${gearwear.userId}`, `Gear ${gearwear.id} configuration deleted`)
        } catch (ex) {
            logger.error("GearWear.delete", `User ${gearwear.userId}`, `Gear ${gearwear.id}`, ex)
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
                        logger.warn("GearWear.processRecentActivities", `${logHelper.user(user)} is suspended, will not process`)
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
                logger.info("GearWear.processUserActivities", logHelper.user(user), dateString, `No activities to process`)
                return 0
            }

            logger.info("GearWear.processUserActivities", logHelper.user(user), dateString, `Processing ${activities.length} activities`)

            // Iterate user's active gearwear configurations and process activities for each one of them.
            const activeConfigs = configs.filter((c) => !c.disabled)
            for (let config of activeConfigs) {
                const findId = {id: config.id}

                // Make sure the Gear is still valid on the user profile.
                if (!_.find(user.profile.bikes, findId) && !_.find(user.profile.shoes, findId)) {
                    await database.merge("gearwear", {id: config.id, disabled: true})
                    eventManager.emit("GearWear.gearNotFound", user, config)
                    logger.warn("GearWear.processUserActivities", logHelper.user(user), `Gear ${config.id} not found on user profile, disabled it`)
                    continue
                }

                // Get recent activities and update tracking.
                const gearActivities = _.filter(activities, (activity: StravaActivity) => (activity.distance || activity.movingTime) && activity.gear && activity.gear.id == config.id)
                await updateTracking(user, config, gearActivities)
                count += gearActivities.length
            }

            // If user is PRO and has a Garmin or Wahoo profile linked, track battery levels.
            if (user.isPro && !user.preferences.privacyMode && (user.garmin?.id || user.wahoo?.id)) {
                await updateBatteryTracking(user, activities)
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
