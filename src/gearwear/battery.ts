// Strautomator Core: GearWear Battery Tracking

import {GearWearBatteryTracker, GearWearDeviceBattery} from "./types"
import {StravaActivity} from "../strava/types"
import {UserData} from "../users/types"
import database from "../database"
import fitparser from "../fitparser"
import mailer from "../mailer"
import _ from "lodash"
import logger from "anyhow"
import * as logHelper from "../loghelper"
import dayjs from "../dayjs"
const settings = require("setmeup").settings

// BATTERY TRACKING
// --------------------------------------------------------------------------

/**
 * Keep track of sensor battery levels, available to PRO only, disabled if privacyMode is set.
 * @param user The user.
 * @param activities Strava activities to be processed.
 */
export const updateBatteryTracking = async (user: UserData, activities: StravaActivity[]): Promise<void> => {
    const debugLogger = user.debug ? logger.warn : logger.debug
    const activitiesLog = `${activities.length || "no"} activities`
    const now = dayjs.utc().toDate()

    try {
        if (!activities || activities.length == 0) {
            debugLogger("GearWear.updateBatteryTracking", logHelper.user(user), "No activities to process")
            return
        }

        // Get (or create) the battery tracker object.
        let isNew = false
        let tracker: GearWearBatteryTracker = await database.get("gearwear-battery", user.id)
        const lowBatteryDevices: Partial<GearWearDeviceBattery>[] = []

        if (!tracker) {
            tracker = {
                id: user.id,
                devices: [],
                dateUpdated: now
            }
            isNew = true
        } else {
            tracker.dateUpdated = now
        }

        // Iterate user activities to update the device battery levels.
        for (let activity of activities) {
            try {
                const matching = await fitparser.getMatchingActivity(user, activity)
                if (!matching) {
                    debugLogger("GearWear.updateBatteryTracking", logHelper.user(user), `Activity ${activity.id} has no matching FIT file`)
                    continue
                }

                const dateUpdated = activity.dateEnd || now

                // Iterate and update device battery status.
                if (matching.deviceBattery?.length > 0) {
                    logger.info("GearWear.updateBatteryTracking", logHelper.user(user), `Processing ${matching.deviceBattery.length} devices for activity ${activity.id}`)

                    for (let deviceBattery of matching.deviceBattery) {
                        const existing = tracker.devices.find((d) => d.id == deviceBattery.id)
                        let changedToLow = false
                        if (existing) {
                            if (existing.status != deviceBattery.status) {
                                logger.info("GearWear.updateBatteryTracking", logHelper.user(user), activitiesLog, `New status: ${deviceBattery.id} - ${deviceBattery.status}`)
                                changedToLow = true
                            }
                            existing.status = deviceBattery.status
                            existing.dateUpdated = dateUpdated
                        } else {
                            tracker.devices.push({id: deviceBattery.id, status: deviceBattery.status, dateUpdated: dateUpdated})
                            logger.info("GearWear.updateBatteryTracking", logHelper.user(user), activitiesLog, `New device tracked: ${deviceBattery.id} - ${deviceBattery.status}`)
                            changedToLow = true
                        }

                        // If device battery status changed to low or critical, add it to the the low battery list.
                        if (["low", "critical"].includes(deviceBattery.status) && changedToLow) {
                            lowBatteryDevices.push(deviceBattery)
                        }
                    }
                }
            } catch (innerEx) {
                logger.error("GearWear.updateBatteryTracking", logHelper.user(user), logHelper.activity(activity), innerEx)
            }
        }

        // No need to save a new tracker if no device battery were found.
        if (isNew && tracker.devices.length == 0) {
            logger.info("GearWear.updateBatteryTracking", logHelper.user(user), activitiesLog, "No battery statuses found, won't create a tracker")
            return
        }

        // Remove devices that were not updated for too long.
        const minDate = dayjs().subtract(settings.gearwear.battery.maxAgeDays, "days")
        const oldDevices = _.remove(tracker.devices, (d) => minDate.isAfter(d.dateUpdated))
        if (oldDevices.length > 0) {
            logger.info("GearWear.updateBatteryTracking", logHelper.user(user), `Removed unseen devices: ${oldDevices.map((d) => d.id).join(", ")}`)
        }

        // Sort the devices by ID.
        tracker.devices = _.sortBy(tracker.devices, "id")

        // Save tracker to the database.
        await database.set("gearwear-battery", tracker, user.id)
        logger.info("GearWear.updateBatteryTracking", logHelper.user(user), activitiesLog, `Tracking ${tracker.devices.length} devices`)

        // Check if user wants to be notified about low battery devices.
        if (!user.preferences.gearwearBatteryAlert || !user.email || lowBatteryDevices.length == 0) {
            return
        }

        // Send low battery alert via email.
        await mailer.send({
            template: "GearWearLowBattery",
            data: {devices: lowBatteryDevices.map((d) => `- ${d.id}: ${d.status.toUpperCase()}`).join("<br />")},
            to: user.email
        })

        logger.info("GearWear.updateBatteryTracking.email", logHelper.user(user), `Devices: ${lowBatteryDevices.map((d) => d.id).join(", ")}`, "Email sent")
    } catch (ex) {
        logger.error("GearWear.updateBatteryTracking", logHelper.user(user), activitiesLog, ex)
    }
}
