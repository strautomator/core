// Strautomator Core: GearWear

import {GearWearConfig, GearWearComponent} from "./types"
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
        } catch (ex) {
            logger.error("GearWear.init", ex)
        }
    }

    /**
     * Validate a gearwear configuration set by the user.
     * @param user The user object.
     * @param gearwear The gearwear configuration.
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
            logger.info("GearWear.getForUser", `User ${user.id}`, `${result.length} gearwear configurations`)

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

            // Get names of the components registered.
            const componentNames = _.map(gearwear.components, "name")

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
            logger.warn("GearWear.delete", `User ${gearwear.userId}`, `Gear ${gearwear.id} deleted`)
        } catch (ex) {
            logger.error("Users.delete", `User ${gearwear.userId}`, `Gear ${gearwear.id}`, ex)
            throw ex
        }
    }

    // PROCESSING
    // --------------------------------------------------------------------------

    /**
     * Process recent activities for all users that have gearwear confiogurations defined.
     */
    processRecentActivities = async (): Promise<void> => {
        try {
            const days = settings.gearwear.previousDays
            const tsAfter = moment.utc().subtract(days, "day").hour(0).minute(0).second(0).unix()
            const tsBefore = moment.utc().subtract(days, "day").hour(23).minute(59).second(59).unix()

            // Get all gearwear configurations from the database,
            // and generate an array with all the user IDs.
            const gearwearList = await database.search("gearwear", null, ["userId", "asc"])
            const userIds = _.uniq(_.map(gearwearList, "userId"))

            // Iterate user IDs to get user data and process recent activities for that particular user.
            for (let userId of userIds) {
                const user = await users.getById(userId)
                const tsLastActivity = moment.utc(user.dateLastActivity).unix()

                // Do not proceed if user has no email set or if no activities were pushed recently.
                if (!user.email) {
                    logger.error("GearWear.processRecentActivities", `User ${user.id} has no email, will not proceed`)
                } else if (tsLastActivity >= tsAfter) {
                    const userGears = _.remove(gearwearList, {userId: userId})
                    await this.processUserActivities(user, userGears, tsAfter, tsBefore)
                }
            }
        } catch (ex) {
            logger.error("GearWear.processRecentActivities", ex)
        }
    }

    /**
     * Process a value string against an activity and return the final result.
     * @param user The user to fetch activities for.
     * @param configs List of gearwear configurations.
     * @param tsAfter Get activities that occured after this timestamp.
     * @param tsBefore Get activities that occured before this timestamp.
     */
    processUserActivities = async (user: UserData, configs: GearWearConfig[], tsAfter: number, tsBefore: number): Promise<void> => {
        const dateString = moment.utc(tsAfter * 1000 + 1000).format("ll")

        try {
            const query = {before: tsBefore, after: tsAfter}
            const activities = await strava.activities.getActivities(user, query)

            // No recent activities found? Stop here.
            if (activities.length == 0) {
                logger.info("GearWear.processUserActivities", `User ${user.id}`, dateString, `No activities to process`)
                return
            }

            logger.info("GearWear.processUserActivities", `User ${user.id}`, dateString, `Will process ${activities.length} activities`)

            // Iterate user activities to update the gear components mileage.
            for (let activity of activities) {
                if (!activity.gear || !activity.gear.id || !activity.distance) continue

                const gearwear = _.find(configs, {id: activity.gear.id})

                if (gearwear) {
                    await this.updateMileage(user, gearwear, activity)
                } else {
                    logger.debug("GearWear.processUserActivities", `User ${user.id}`, dateString, `No config for gear ${activity.gear.id}`)
                }
            }
        } catch (ex) {
            logger.error("GearWear.processUserActivities", `User ${user.id}`, dateString, ex)
        }

        // Iterate all gearwear configurations and remove the updating flag (if it was set).
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
    }

    /**
     * Update gear component mileage with the provided Strava activity.
     * @param user The user owner of the gear and component.
     * @param config The gearwear config.
     * @param activity Strava activity that should be used to update mileages.
     */
    updateMileage = async (user: UserData, config: GearWearConfig, activity: StravaActivity): Promise<void> => {
        try {
            let id: string
            let component: GearWearComponent

            // Set the updating flag to avoid edits by the user while mileage is updated.
            config.updating = true

            // Iterate and update mileage on gear components.
            for ([id, component] of Object.entries(config.components)) {
                component.currentMileage += activity.distance

                if (component.currentMileage >= component.alertMileage) {
                    const reminderMileage = component.alertMileage * settings.gearwear.reminderThreshold

                    if (component.alertSent == 0) {
                        this.triggerMileageAlert(user, component, activity, false)
                    } else if (component.alertSent == 1 && component.currentMileage > reminderMileage) {
                        this.triggerMileageAlert(user, component, activity, true)
                    }
                }
            }

            await database.set("gearwear", config, config.id)
        } catch (ex) {
            logger.error("GearWear.updateMileage", `User ${user.id}`, `Gear ${config.id}`, `Activity ${activity.id}`, ex)
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
            component.alertSent++

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
                alertMileage: component.alertSent
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
