// Strautomator Core: GearWear Tracking

import {GearWearConfig, GearWearComponent} from "./types"
import {notifyUsage} from "./notifications"
import {StravaActivity} from "../strava/types"
import {isActivityIgnored} from "../strava/utils"
import {UserData} from "../users/types"
import database from "../database"
import notifications from "../notifications"
import _ from "lodash"
import logger from "anyhow"
import * as logHelper from "../loghelper"
import dayjs from "../dayjs"
const settings = require("setmeup").settings

// GEAR TRACKING
// --------------------------------------------------------------------------

/**
 * Update gear component distance / time (hours) with the provided Strava activities.
 * @param user The user owner of the gear and component.
 * @param config The GearWear configuration.
 * @param activities Strava activities to be processed.
 */
export const updateTracking = async (user: UserData, config: GearWearConfig, activities: StravaActivity[]): Promise<void> => {
    const debugLogger = user.debug ? logger.warn : logger.debug
    const now = dayjs.utc()

    try {
        if (!activities || activities.length == 0) {
            debugLogger("GearWear.updateTracking", logHelper.user(user), `Gear ${config.id}`, `No activities to process`)
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
        if (user.isPro && !config.recentActivities) {
            config.recentActivities = []
        }

        // Iterate user activities to update the gear components distance.
        for (let activity of activities) {
            if (isActivityIgnored(user, activity, "gear")) {
                continue
            }

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
                if (user.isPro && !config.recentActivities.includes(activity.id)) {
                    config.recentActivities.push(activity.id)
                }

                // Append totals.
                if (distance > 0) totalDistance += distance
                if (activity.movingTime > 0) totalTime += activity.movingTime

                // Iterate and update distance on gear components.
                for ([id, component] of Object.entries(config.components)) {
                    if (component.disabled) {
                        debugLogger("GearWear.updateTracking", logHelper.user(user), `Gear ${config.id} - ${component.name}`, logHelper.activity(activity), `Not updated - ${id}, component is disabled`)
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

                    component.dateLastUpdate = now.toDate()

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
                            await notifyUsage(user, component, activity, "PreAlert")
                        } else if (component.currentDistance >= component.alertDistance) {
                            if (!component.dateAlertSent) {
                                await notifyUsage(user, component, activity, "Alert")
                            } else if (component.currentDistance >= reminderDistance && isReminder) {
                                await notifyUsage(user, component, activity, "Reminder")
                            }
                        }
                    }

                    // Do the same, but for time based (hours) tracking.
                    if (component.alertTime > 0) {
                        const reminderTime = component.alertTime * settings.gearwear.reminderThreshold
                        const usagePercent = component.currentTime / component.alertTime

                        if (!component.datePreAlertSent && component.preAlertPercent && usagePercent >= component.preAlertPercent) {
                            await notifyUsage(user, component, activity, "PreAlert")
                        } else if (component.currentTime >= component.alertTime) {
                            if (!component.dateAlertSent) {
                                await notifyUsage(user, component, activity, "Alert")
                            } else if (component.currentTime >= reminderTime && isReminder) {
                                await notifyUsage(user, component, activity, "Reminder")
                            }
                        }
                    }
                }
            } catch (innerEx) {
                logger.error("GearWear.updateTracking", logHelper.user(user), `Gear ${config.id}`, logHelper.activity(activity), innerEx)
            }
        }

        // Limit the amount of recent activities to 20.
        if (config.recentActivities.length > settings.gearwear.maxRecentActivities) {
            config.recentActivities = _.takeRight(config.recentActivities, settings.gearwear.maxRecentActivities)
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
export const resetTracking = async (user: UserData, config: GearWearConfig, componentName: string): Promise<void> => {
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
        component.dateLastUpdate = now.toDate()
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
            const gearNotifications = await notifications.getByGear(user, config.id)

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
