// Strautomator Core: GearWear

import {GearWearDbState, GearWearConfig, GearWearComponent} from "./types"
import {StravaActivity, StravaGear} from "../strava/types"
import {UserData} from "../users/types"
import database from "../database"
import mailer from "../mailer"
import strava from "../strava"
import users from "../users"
import _ = require("lodash")
import logger = require("anyhow")
import moment = require("moment")
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

    // INIT AND VALIDATION
    // --------------------------------------------------------------------------

    /**
     * Init the GearWear Manager.
     */
    init = async () => {
        try {
            if (settings.gearwear.previousDays < 1) {
                throw new Error(`The gearwear.previousDays must be at least 1 (which means yesterday)`)
            }
            if (settings.gearwear.reminderThreshold <= 1) {
                throw new Error(`The gearwear.reminderThreshold setting must be higher than 1`)
            }

            const state: GearWearDbState = await database.appState.get("gearwear")

            if (state && state.dateLastProcessed) {
                const lastDate = moment.utc(state.dateLastProcessed)

                // Make sure the processing flag is not stuck due to whatever reason.
                if (state.processing) {
                    const minDate = moment.utc().subtract(25, "hours")

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
    }

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

            if (!gear) {
                throw new Error(`User has no gear ID ${gearwear.id}`)
            }

            if (!gearwear.components) {
                throw new Error("Missing gear components")
            }

            // Valid component fields.
            const validCompFields = ["name", "currentMileage", "alertMileage", "dateAlertSent", "history"]

            // Validate individual components.
            for (let comp of gearwear.components) {
                if (comp.alertMileage < 100) {
                    throw new Error("Minimum accepted alert mileage is 100")
                }

                // Make sure the history array is present.
                if (!comp.history) {
                    comp.history = []
                }

                // Remove non-relevant fields.
                const compFields = Object.keys(comp)
                for (let key of compFields) {
                    if (validCompFields.indexOf(key) < 0) {
                        logger.error("GearWear.validate", `User ${user.id}`, `Gear ${gearwear.id} - ${comp.name}`, `Removed invalid field: ${key}`)
                        delete comp[key]
                    }
                }
            }
        } catch (ex) {
            logger.error("GearWear.validate", `User ${user.id}`, JSON.stringify(gearwear, null, 0), ex)
            throw ex
        }
    }

    // GET AND UPDATE
    // --------------------------------------------------------------------------

    /**
     * Get list of GearWear configurations for the specified user.
     * @param id The ID of the GearWeat to be fetched.
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
     */
    getForUser = async (user: UserData): Promise<GearWearConfig[]> => {
        try {
            const result: GearWearConfig[] = await database.search("gearwear", ["userId", "==", user.id])
            logger.info("GearWear.getForUser", `User ${user.id}`, `${result.length} GearWear configurations`)

            return result
        } catch (ex) {
            logger.error("GearWear.getForUser", `User ${user.id}`, ex)
            throw ex
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

            // Validate configuration before proceeeding.
            this.validate(user, gearwear)

            // Get names of the components registered.
            const componentNames = _.map(gearwear.components, "name").join(", ")

            // Set registration date, if user does not exist yet.
            if (!exists) {
                logger.info("GearWear.upsert", `User ${user.id}`, `New configuration for ${gearwear.id}`)
            }

            // Save user to the database.
            await database.merge("gearwear", gearwear, doc)
            logger.info("GearWear.upsert", `User ${user.id}`, `Gear ${gearwear.id} - ${gear.name}`, `Components: ${componentNames}`)

            return gearwear
        } catch (ex) {
            logger.error("GearWear.upsert", `User ${user.id}`, `Gear ${gearwear.id}`, ex)
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
            logger.error("Users.delete", `User ${gearwear.userId}`, `Gear ${gearwear.id}`, ex)
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

            // First we check if method is currently processing or if it already ran successfully today.
            // If so, log a warning and abort execution.
            if (state) {
                if (state.processing) {
                    logger.warn("GearWear.processRecentActivities", "Abort", `Another execution is happening right now`)
                    return
                }

                if (state.dateLastProcessed) {
                    const today = moment.utc()
                    const runDate = moment.utc(state.dateLastProcessed)

                    if (runDate.dayOfYear() == today.dayOfYear() && state.recentActivityCount > 0) {
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

            // Get correct date and timestamps to fetch activities on Strava.
            const days = settings.gearwear.previousDays
            const tsAfter = moment.utc().subtract(days, "day").hour(0).minute(0).second(0).unix()
            const tsBefore = moment.utc().subtract(days, "day").hour(23).minute(59).second(59).unix()

            // Get all GearWear configurations from the database,
            // and generate an array with all the user IDs.
            const gearwearList = await database.search("gearwear", null, ["userId", "asc"])
            const userIds = _.uniq(_.map(gearwearList, "userId"))

            // Iterate user IDs to get user data and process recent activities for that particular user.
            for (let userId of userIds) {
                try {
                    const user = await users.getById(userId)
                    const tsLastActivity = moment.utc(user.dateLastActivity).unix()

                    // Do not proceed if user has no email set or if no activities were pushed recently.
                    if (!user.email) {
                        logger.warn("GearWear.processRecentActivities", `User ${user.id} has no email, will not proceed`)
                    } else if (tsLastActivity >= tsAfter) {
                        const userGears = _.remove(gearwearList, {userId: userId})
                        activityCount += await this.processUserActivities(user, userGears, tsAfter, tsBefore)
                        userCount++
                    }
                } catch (userEx) {
                    logger.error("GearWear.processRecentActivities", `Failed to process activities for user ${userId}`)
                }
            }

            // Save gearwear state to the database.
            state = {
                recentActivityCount: activityCount,
                recentUserCount: userCount,
                dateLastProcessed: moment.utc().toDate(),
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
     * Process recent activities for the specified user and increase the relevant GearWear mileages.
     * Returns the number of processed actvities for the user.
     * @param user The user to fetch activities for.
     * @param configs List of GearWear configurations.
     * @param tsAfter Get activities that occured after this timestamp.
     * @param tsBefore Get activities that occured before this timestamp.
     */
    processUserActivities = async (user: UserData, configs: GearWearConfig[], tsAfter: number, tsBefore: number): Promise<number> => {
        let dateString = moment.utc(tsAfter * 1000 + 1000).format("ll")
        let count = 0

        try {
            const query = {before: tsBefore, after: tsAfter}
            const activities = await strava.activities.getActivities(user, query)

            // No recent activities found? Stop here.
            if (activities.length == 0) {
                logger.info("GearWear.processUserActivities", `User ${user.id}`, dateString, `No activities to process`)
                return 0
            }

            logger.info("GearWear.processUserActivities", `User ${user.id}`, dateString, `Processing ${activities.length} activities`)

            // Iterate user's gearwear configurations and process activities for each one of them.
            for (let config of configs) {
                const gearActivities = _.remove(activities, (activity) => activity.distance && activity.gear && activity.gear.id == config.id)
                await this.updateMileage(user, config, gearActivities)
            }
        } catch (ex) {
            logger.error("GearWear.processUserActivities", `User ${user.id}`, dateString, ex)
        }

        // Iterate all GearWear configurations and remove the updating flag (if it was set).
        for (let config of configs) {
            try {
                if (config.updating) {
                    config.updating = false
                    await database.set("gearwear", config, config.id)
                }
            } catch (ex) {
                logger.error("GearWear.processUserActivities", `User ${user.id}`, dateString, `Gear ${config.id} updating=false`, ex)
            }
        }

        return count
    }

    /**
     * Update gear component mileage with the provided Strava activity.
     * @param user The user owner of the gear and component.
     * @param config The GearWear configuration.
     * @param activity Strava activity that should be used to update mileages.
     */
    updateMileage = async (user: UserData, config: GearWearConfig, activities: StravaActivity[]): Promise<void> => {
        try {
            if (!activities || activities.length == 0) {
                logger.debug("GearWear.updateMileage", `User ${user.id}`, `Gear ${config.id}`, `No activities to process`)
                return
            }

            let id: string
            let component: GearWearComponent

            // Set the updating flag to avoid edits by the user while mileage is updated.
            config.updating = true

            // Iterate user activities to update the gear components mileage.
            for (let activity of activities) {
                try {
                    if (activity.distance < 1) continue

                    // Iterate and update mileage on gear components.
                    for ([id, component] of Object.entries(config.components)) {
                        const minReminderDate = moment.utc().subtract(settings.gearwear.reminderDays, "days")
                        const reminderMileage = component.alertMileage * settings.gearwear.reminderThreshold

                        component.currentMileage += activity.distance

                        // Check if component has reached the initial or reminder mileage thresholds to
                        // send an alert to the user.
                        if (component.currentMileage >= component.alertMileage) {
                            if (!component.dateAlertSent) {
                                this.triggerMileageAlert(user, component, activity)
                            } else if (component.currentMileage >= reminderMileage && moment.utc(component.dateAlertSent).isBefore(minReminderDate)) {
                                this.triggerMileageAlert(user, component, activity, true)
                            }
                        }
                    }
                } catch (innerEx) {
                    logger.error("GearWear.updateMileage", `User ${user.id}`, `Gear ${config.id}`, `Activity ${activity.id}`, innerEx)
                }
            }

            await database.set("gearwear", config, config.id)
        } catch (ex) {
            logger.error("GearWear.updateMileage", `User ${user.id}`, `Gear ${config.id}`, ex)
        }
    }

    /**
     * Reset the current mileage for the specified gear component.
     * @param config The GearWear configuration.
     * @param component The component to have its mileage set to 0.
     */
    resetMileage = async (config: GearWearConfig, componentName: string): Promise<void> => {
        try {
            const component: GearWearComponent = _.find(config.components, {name: componentName})

            if (!component) {
                throw new Error(`Component not found`)
            }

            const currentMileage = component.currentMileage

            // If current mileage is 0, then do nothing.
            if (currentMileage == 0) {
                logger.warn("GearWear.resetMileage", `User ${config.userId}`, `Gear ${config.id} - ${componentName}`, "Mileage was already 0")
                return
            }

            // Make sure history array is initialized.
            if (!component.history) {
                component.history = []
            }

            // Update component to mileage 0, and an event to the component history.
            component.dateAlertSent = null
            component.currentMileage = 0
            component.history.push({date: moment.utc().toDate(), mileage: currentMileage})

            // Save to the database and log.
            await database.set("gearwear", config, config.id)
            logger.info("GearWear.resetMileage", `User ${config.userId}`, `Gear ${config.id} - ${componentName}`, "Mileage set to 0")
        } catch (ex) {
            logger.error("GearWear.resetMileage", `User ${config.userId}`, `Gear ${config.id} - ${componentName}`, ex)
        }
    }

    /**
     * Sends an email to the user when a specific component has reached its mileage alert threshold.
     * @param user The user owner of the component.
     * @param component The component that has reached the alert mileage.
     * @param activity The Strava activity that triggered the mileage alert.
     * @param reminder If true it means it's a second alert (reminder) being sent.
     */
    triggerMileageAlert = async (user: UserData, component: GearWearComponent, activity: StravaActivity, reminder?: boolean): Promise<void> => {
        const units = user.profile.units == "imperial" ? "mi" : "km"
        const logMileage = `Mileage ${component.alertMileage} / ${component.currentMileage} ${units}`
        const logGear = `Gear ${activity.gear.id} - ${component.name}`

        try {
            component.dateAlertSent = moment.utc().toDate()

            // Get bike or shoe details.
            const bike = _.find(user.profile.bikes, {id: activity.gear.id})
            const shoe = _.find(user.profile.shoes, {id: activity.gear.id})
            const gear: StravaGear = bike || shoe

            // Set correct template and keywords to be replaced.
            const template = reminder ? "GearWearReminder" : "GearWearAlert"
            const data = {
                units: units,
                gearId: gear.id,
                gearName: gear.name,
                component: component.name,
                currentMileage: component.currentMileage,
                alertMileage: component.alertMileage
            }

            // Dispatch email to user.
            mailer.send({
                template: template,
                data: data,
                to: user.email
            })

            logger.info("GearWear.triggerMileageAlert", `User ${user.id}`, logGear, `Activity ${activity.id}`, logMileage, reminder ? "Reminder sent" : "Alert sent")
        } catch (ex) {
            logger.error("GearWear.triggerMileageAlert", `User ${user.id}`, logGear, `Activity ${activity.id}`, ex)
        }
    }
}

// Exports...
export default GearWear.Instance
