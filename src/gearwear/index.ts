// Strautomator Core: GearWear

import {GearWearDbState, GearWearConfig, GearWearComponent} from "./types"
import {StravaActivity, StravaGear} from "../strava/types"
import {UserData} from "../users/types"
import database from "../database"
import eventManager from "../eventmanager"
import mailer from "../mailer"
import notifications from "../notifications"
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
    }

    /**
     * Delete user gearwear configs after it gets deleted from the database.
     * @param user User that was deleted from the database.
     */
    private onUserDelete = async (user: UserData): Promise<void> => {
        try {
            const counter = await database.delete("gearwear", ["userId", "==", user.id])

            if (counter > 0) {
                logger.info("GearWear.onUsersDelete", logHelper.user(user), `Deleted ${counter} GearWear configs`)
            }
        } catch (ex) {
            logger.error("GearWear.onUsersDelete", logHelper.user(user), ex)
        }
    }

    // VALIDATION
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
            const validCompFields = ["name", "currentDistance", "currentTime", "alertDistance", "alertTime", "preAlertPercent", "datePreAlertSent", "dateAlertSent", "activityCount", "history", "disabled"]

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

    // GET
    // --------------------------------------------------------------------------

    /**
     * Get list of GearWear configurations for the specified user.
     * @param id The ID of the GearWear to be fetched.
     */
    getById = async (id: string): Promise<GearWearConfig> => {
        try {
            const result: GearWearConfig = await database.get("gearwear", id)

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
    getForUser = async (user: UserData, includeExpired?: boolean): Promise<GearWearConfig[]> => {
        try {
            const result: GearWearConfig[] = await database.search("gearwear", ["userId", "==", user.id])

            // If the includeExpired flag is not set, remove GearWear with no matching gear on Strava.
            if (!includeExpired) {
                const allGear = _.concat(user.profile.bikes || [], user.profile.shoes || [])
                _.remove(result, (g) => !_.find(allGear, {id: g.id}))
                logger.info("GearWear.getForUser", logHelper.user(user), `${result.length} active GearWear configurations`)
            } else {
                logger.info("GearWear.getForUser", logHelper.user(user), `${result.length} total GearWear configurations`)
            }

            return result
        } catch (ex) {
            logger.error("GearWear.getForUser", logHelper.user(user), ex)
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
     */
    upsert = async (user: UserData, gearwear: GearWearConfig): Promise<GearWearConfig> => {
        try {
            const doc = database.doc("gearwear", gearwear.id)
            const docSnapshot = await doc.get()
            const exists = docSnapshot.exists

            const bike = _.find(user.profile.bikes, {id: gearwear.id})
            const shoe = _.find(user.profile.shoes, {id: gearwear.id})
            const gear: StravaGear = bike || shoe

            if (!gear) {
                throw new Error(`Gear ${gearwear.id} does not exist`)
            }

            // Validate configuration before proceeding.
            this.validate(user, gearwear)

            // Get names of the components registered.
            const componentNames = _.map(gearwear.components, "name").join(", ")

            // Set registration date, if user does not exist yet.
            if (!exists) {
                logger.info("GearWear.upsert", logHelper.user(user), `New configuration for ${gearwear.id}`)
            }

            // Save user to the database.
            await database.merge("gearwear", gearwear, doc)
            logger.info("GearWear.upsert", logHelper.user(user), `Gear ${gearwear.id} - ${gear.name}`, `Components: ${componentNames}`)

            return gearwear
        } catch (ex) {
            logger.error("GearWear.upsert", logHelper.user(user), `Gear ${gearwear.id}`, ex)
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

    // PROCESSING
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
                await Promise.all(userIds.splice(0, batchSize).map(processForUser))
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

        try {
            const activities = await strava.activities.getActivities(user, {after: dDateFrom, before: dDateTo})

            // No recent activities found? Stop here.
            if (activities.length == 0) {
                logger.info("GearWear.processUserActivities", logHelper.user(user), dateString, `No activities to process`)
                return 0
            }

            logger.info("GearWear.processUserActivities", logHelper.user(user), dateString, `Processing ${activities.length} activities`)

            // Iterate user's gearwear configurations and process activities for each one of them.
            for (let config of configs) {
                const gearActivities = _.remove(activities, (activity: StravaActivity) => (activity.distance || activity.movingTime) && activity.gear && activity.gear.id == config.id)
                await this.updateTracking(user, config, gearActivities)
                count += gearActivities.length
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

    /**
     * Update gear component distance / time (hours) with the provided Strava activity.
     * @param user The user owner of the gear and component.
     * @param config The GearWear configuration.
     * @param activity Strava activity that should be used to update distances.
     */
    updateTracking = async (user: UserData, config: GearWearConfig, activities: StravaActivity[]): Promise<void> => {
        try {
            const now = dayjs.utc()

            // Stop here if no activities were passed.
            if (!activities || activities.length == 0) {
                logger.debug("GearWear.updateTracking", logHelper.user(user), `Gear ${config.id}`, `No activities to process`)
                return
            }

            // Stop here if all components are disabled.
            const disabledCount = config.components.filter((c) => c.disabled).length
            if (config.components.length == disabledCount) {
                logger.warn("GearWear.updateTracking", logHelper.user(user), `Gear ${config.id}`, "All components are disabled, will not proceed")
                return
            }

            // GearWear processing data.

            let id: string
            let component: GearWearComponent
            let activityIds: number[] = []
            let totalDistance = 0
            let totalTime = 0

            // Set the updating flag to avoid edits by the user while distance is updated.
            config.updating = true

            // Iterate user activities to update the gear components distance.
            for (let activity of activities) {
                try {
                    const distance = activity.distance

                    // Stop here if activity has no valid distance and time.
                    if (!distance && !activity.movingTime) {
                        logger.warn("GearWear.updateTracking", logHelper.user(user), `Gear ${config.id}`, `${logHelper.activity(activity)} nas no distance or time`)
                        continue
                    }

                    // Make sure we don't process the same activity again in case the user has changed the delay preference.
                    if (config.lastUpdate && config.lastUpdate.activities.includes(activity.id)) {
                        logger.warn("GearWear.updateTracking", logHelper.user(user), `Gear ${config.id}`, `${logHelper.activity(activity)} was already processed`)
                        continue
                    }

                    activityIds.push(activity.id)

                    // Append totals.
                    if (distance > 0) totalDistance += distance
                    if (activity.movingTime > 0) totalTime += activity.movingTime

                    // Iterate and update distance on gear components.
                    for ([id, component] of Object.entries(config.components)) {
                        if (component.disabled) {
                            logger.debug("GearWear.updateTracking", logHelper.user(user), `Gear ${config.id} - ${component.name}`, logHelper.activity(activity), "Not updated, component is disabled")
                            continue
                        }

                        const historyLength = component.history?.length || 0
                        const minReminderDate = now.subtract(settings.gearwear.reminderDays, "days")
                        const isReminder = dayjs.utc(component.dateAlertSent).isBefore(minReminderDate)

                        // If component was recently reset, then do not update the tracking
                        // as the activity was still for the previous component.
                        const historyDates = historyLength > 0 ? component.history.map((h) => dayjs(h.date).utc().valueOf()) : []
                        const mostRecentTimestamp = _.max(historyDates) || 0
                        if (mostRecentTimestamp >= activity.dateStart.valueOf()) {
                            logger.warn("GearWear.updateTracking", logHelper.user(user), `Gear ${config.id} - ${component.name}`, `Replaced recently so won't update the tracking for activity ${activity.id}`)
                            continue
                        }

                        // Increase activity count.
                        if (!component.activityCount) component.activityCount = 0
                        component.activityCount++

                        // Make sure current values are at least 0.
                        if (!component.currentDistance) component.currentDistance = 0
                        if (!component.currentTime) component.currentTime = 0

                        // Increase distance (distance) and time (hours).
                        if (distance > 0) component.currentDistance += distance
                        if (activity.movingTime > 0) component.currentTime += activity.movingTime

                        // Round to 1 decimal case.
                        component.currentDistance = Math.round(component.currentDistance * 10) / 10
                        component.currentTime = Math.round(component.currentTime * 10) / 10

                        // Check if component has reached the pre alert threshold, alert, or if it needs to
                        // send a reminder based on the mileage.
                        if (component.alertDistance > 0) {
                            const reminderDistance = component.alertDistance * settings.gearwear.reminderThreshold
                            const usagePercent = (component.currentDistance / component.alertDistance) * 100

                            if (!component.datePreAlertSent && component.preAlertPercent && usagePercent >= component.preAlertPercent) {
                                await this.notify(user, component, activity, "PreAlert")
                            } else if (component.currentDistance >= component.alertDistance) {
                                if (!component.dateAlertSent) {
                                    await this.notify(user, component, activity, "Alert")
                                } else if (component.currentDistance >= reminderDistance && isReminder) {
                                    await this.notify(user, component, activity, "Reminder")
                                }
                            }
                        }

                        // Do the same, but for time based (hours) tracking.
                        if (component.alertTime > 0) {
                            const reminderTime = component.alertTime * settings.gearwear.reminderThreshold
                            const usagePercent = component.currentTime / component.alertTime

                            if (!component.datePreAlertSent && component.preAlertPercent && usagePercent >= component.preAlertPercent) {
                                await this.notify(user, component, activity, "PreAlert")
                            } else if (component.currentTime >= component.alertTime) {
                                if (!component.dateAlertSent) {
                                    await this.notify(user, component, activity, "Alert")
                                } else if (component.currentTime >= reminderTime && isReminder) {
                                    await this.notify(user, component, activity, "Reminder")
                                }
                            }
                        }
                    }
                } catch (innerEx) {
                    logger.error("GearWear.updateTracking", logHelper.user(user), `Gear ${config.id}`, logHelper.activity(activity), innerEx)
                }
            }

            // Set update details on the GearWear config.
            config.updating = false
            config.lastUpdate = {
                date: now.toDate(),
                activities: activityIds,
                distance: parseFloat(totalDistance.toFixed(1)),
                time: totalTime
            }

            // Save config to the database.
            await database.set("gearwear", config, config.id)

            const updatedCount = config.components.length - disabledCount
            const units = user.profile.units == "imperial" ? "mi" : "km"
            logger.info("GearWear.updateTracking", logHelper.user(user), `Gear ${config.id}`, `${updatedCount} components`, `Added ${totalDistance.toFixed(1)} ${units}, ${(totalTime / 3600).toFixed(1)} hours`)
        } catch (ex) {
            logger.error("GearWear.updateTracking", logHelper.user(user), `Gear ${config.id}`, ex)
        }
    }

    /**
     * Reset the current distance / time tracking for the specified gear component.
     * @param user The GearWear owner.
     * @param config The GearWear configuration.
     * @param component The component to have its distance set to 0.
     */
    resetTracking = async (user: UserData, config: GearWearConfig, componentName: string): Promise<void> => {
        try {
            const component: GearWearComponent = _.find(config.components, {name: componentName}) || _.find(config.components, {name: decodeURIComponent(componentName)})

            if (!component) {
                throw new Error(`Component not found in: ${config.components.map((c) => c.name).join(", ")}`)
            }

            const now = dayjs.utc()
            const dateFormat = "YYYY-MM-DD"
            const currentDistance = component.currentDistance
            const currentTime = component.currentTime
            const hours = Math.round(currentTime / 3600)

            // If current distance and time are 0, then do nothing.
            if (currentDistance < 1 && currentTime < 1) {
                logger.warn("GearWear.resetTracking", logHelper.user(user), `Gear ${config.id} - ${componentName}`, "Distance and time are 0, will not reset")
                return
            }

            // Make sure history array is initialized, and do not proceed if there was already
            // a reset triggered today.
            if (!component.history) {
                component.history = []
            } else if (component.history.find((h) => dayjs(h.date).format(dateFormat) == now.format(dateFormat))) {
                logger.warn("GearWear.resetTracking", logHelper.user(user), `Gear ${config.id} - ${componentName}`, "Already reset today, will not reset again")
                return
            }

            // Reset the actual distance / time / activity count.
            component.datePreAlertSent = null
            component.dateAlertSent = null
            component.currentDistance = 0
            component.currentTime = 0
            component.activityCount = 0

            // Only update the history if privacy mode is not enabled.
            if (!user.preferences.privacyMode) {
                component.history.push({date: now.toDate(), distance: currentDistance, time: currentTime})
            }

            // Save to the database and log.
            await database.set("gearwear", config, config.id)
            logger.info("GearWear.resetTracking", logHelper.user(user), `Gear ${config.id} - ${componentName}`, `Resetting distance ${currentDistance} and ${hours} hours`)

            // Clear pending gear notifications (mark them as read) if user has no email set.
            if (!user.email) {
                const gearNotifications = await notifications.getForGear(user, config.id)

                if (gearNotifications.length > 0) {
                    for (let n of gearNotifications) {
                        await notifications.markAsRead(user, n.id)
                    }

                    logger.info("GearWear.resetTracking", logHelper.user(user), `Gear ${config.id}`, "Marked pending notifications as read")
                }
            }
        } catch (ex) {
            logger.error("GearWear.resetTracking", logHelper.user(user), `Gear ${config.id} - ${componentName}`, ex)
        }
    }

    /**
     * Sends an email to the user when a specific component has reached its distance / time alert threshold.
     * @param user The user owner of the component.
     * @param component The component that has reached the alert distance.
     * @param activity The Strava activity that triggered the distance alert.
     */
    notify = async (user: UserData, component: GearWearComponent, activity: StravaActivity, alertType: "PreAlert" | "Alert" | "Reminder"): Promise<void> => {
        const units = user.profile.units == "imperial" ? "mi" : "km"
        const logDistance = `Distance ${component.currentDistance} / ${component.alertDistance} ${units}`
        const logGear = `Gear ${activity.gear.id} - ${component.name}`
        const now = dayjs.utc()

        // Check if an alert was recently sent, and if so, stop here.
        const minReminderDate = now.subtract(settings.gearwear.reminderDays, "days")
        const datePreAlertSent = component.datePreAlertSent ? dayjs.utc(component.datePreAlertSent) : null
        const dateAlertSent = component.dateAlertSent ? dayjs.utc(component.dateAlertSent) : null
        if (datePreAlertSent?.isAfter(minReminderDate) || dateAlertSent?.isAfter(minReminderDate)) {
            logger.warn("GearWear.notify", logHelper.user(user), logGear, "User was already notified recently")
            return
        }

        try {
            if (alertType == "PreAlert") {
                component.datePreAlertSent = now.toDate()
            } else {
                component.dateAlertSent = now.toDate()
            }

            // Get bike or shoe details.
            const hours = component.currentTime / 3600
            const bike = _.find(user.profile.bikes, {id: activity.gear.id})
            const shoe = _.find(user.profile.shoes, {id: activity.gear.id})
            const gear: StravaGear = bike || shoe

            // Calculate usage from 0 to 100% (or more, if surpassed the alert threshold).
            const usage = (component.alertDistance ? component.currentDistance / component.alertDistance : component.currentTime / component.alertTime) * 100

            // Get alert details (distance and time).
            const alertDetails = []
            if (component.alertDistance > 0) alertDetails.push(`${component.alertDistance} ${units}`)
            if (component.alertTime > 0) alertDetails.push(`${Math.round(component.alertTime / 3600)} hours`)

            // User has email set? Send via email, otherwise create a notification.
            if (user.email) {
                const template = `GearWear${alertType}`
                const compName = encodeURIComponent(component.name)
                const data = {
                    units: units,
                    userId: user.id,
                    gearId: gear.id,
                    gearName: gear.name,
                    component: component.name,
                    currentDistance: component.currentDistance,
                    currentTime: Math.round(hours * 10) / 10,
                    usage: Math.round(usage),
                    alertDetails: alertDetails.join(", "),
                    resetLink: `${settings.app.url}gear/edit?id=${gear.id}&reset=${compName}`,
                    affiliateLink: `${settings.affiliates.baseUrl}s/${compName}?rn=1&from=${settings.app.title}`,
                    tips: component.name.toLowerCase().replace(/ /g, "")
                }

                // Dispatch email to user.
                await mailer.send({
                    template: template,
                    data: data,
                    to: user.email
                })

                logger.info("GearWear.notify.email", logHelper.user(user), logGear, logHelper.activity(activity), logDistance, `${alertType} sent`)
            } else if (alertType == "Alert") {
                const nOptions = {
                    title: `Gear alert: ${gear.name} - ${component.name}`,
                    body: `This component has now passed its target usage: ${alertDetails.join(", ")}`,
                    href: `/gear/edit?id=${gear.id}`,
                    gearId: gear.id,
                    component: component.name
                }
                await notifications.createNotification(user, nOptions)

                logger.info("GearWear.notify.notification", logHelper.user(user), logGear, logHelper.activity(activity), logDistance, "Notification created")
            }
        } catch (ex) {
            logger.error("GearWear.notify", logHelper.user(user), logGear, logHelper.activity(activity), ex)
        }
    }
}

// Exports...
export default GearWear.Instance
