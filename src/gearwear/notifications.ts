// Strautomator Core: GearWear Notify

import {GearWearComponent, GearWearConfig} from "./types"
import {StravaActivity, StravaGear} from "../strava/types"
import {UserData} from "../users/types"
import database from "../database"
import mailer from "../mailer"
import notifications from "../notifications"
import _ from "lodash"
import logger from "anyhow"
import * as logHelper from "../loghelper"
import dayjs from "../dayjs"
const settings = require("setmeup").settings

// NOTIFICATIONS
// --------------------------------------------------------------------------

/**
 * Sends an email to the user when a specific component has reached its distance / time alert threshold.
 * @param user The user owner of the component.
 * @param component The component that has reached the alert distance.
 * @param activity The Strava activity that triggered the distance alert.
 */
export const notifyUsage = async (user: UserData, component: GearWearComponent, activity: StravaActivity, alertType: "PreAlert" | "Alert" | "Reminder"): Promise<void> => {
    const units = user.profile.units == "imperial" ? "mi" : "km"
    const logDistance = `Distance ${component.currentDistance} / ${component.alertDistance} ${units}`
    const logGear = `Gear ${activity.gear.id} - ${component.name}`
    const now = dayjs.utc()

    // Check if an alert was recently sent, and if so, stop here.
    const minReminderDate = now.subtract(settings.gearwear.reminderDays, "days")
    const datePreAlertSent = component.datePreAlertSent ? dayjs.utc(component.datePreAlertSent) : null
    const dateAlertSent = component.dateAlertSent ? dayjs.utc(component.dateAlertSent) : null
    if (datePreAlertSent?.isAfter(minReminderDate) || dateAlertSent?.isAfter(minReminderDate)) {
        logger.warn("GearWear.notifyUsage", logHelper.user(user), logGear, "User was already notified recently")
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
                resetLink: `${settings.app.url}gear/edit?id=${gear.id}&reset=${encodeURIComponent(compName)}`,
                affiliateLink: `${settings.countryLinkify.server.url}s/${compName}?rn=1&from=${encodeURIComponent(settings.app.title)}`,
                tips: component.name.toLowerCase().replace(/ /g, "")
            }

            // Dispatch email to user.
            await mailer.send({
                template: template,
                data: data,
                to: user.email
            })

            logger.info("GearWear.notifyUsage.email", logHelper.user(user), logGear, logHelper.activity(activity), logDistance, `${alertType} sent`)
        } else if (alertType == "Alert") {
            const nOptions = {
                title: `Gear alert: ${gear.name} - ${component.name}`,
                body: `This component has now passed its target usage: ${alertDetails.join(", ")}`,
                href: `/gear/edit?id=${gear.id}`,
                gearId: gear.id,
                component: component.name
            }
            await notifications.createNotification(user, nOptions)

            logger.info("GearWear.notifyUsage.notification", logHelper.user(user), logGear, logHelper.activity(activity), logDistance, "Notification created")
        }
    } catch (ex) {
        logger.error("GearWear.notifyUsage", logHelper.user(user), logGear, logHelper.activity(activity), ex)
    }
}

/**
 * Sends an email when a component hasn't been updated for many weeks.
 * @param user The user owner of the component.
 * @param config The GearWear configuration.
 * @param components The components that haven't been updated for a while.
 */
export const notifyIdle = async (user: UserData, config: GearWearConfig, components: GearWearComponent[]): Promise<void> => {
    const units = user.profile.units == "imperial" ? "mi" : "km"

    // Stop here if user is suspended.
    if (user.suspended) {
        logger.warn("GearWear.notifyIdle", logHelper.user(user), logHelper.gearwearConfig(user, config), "User is suspended, won't notify")
        return
    }

    // Validate components.
    if (!components || components.length == 0) {
        logger.debug("GearWear.notifyIdle", logHelper.user(user), logHelper.gearwearConfig(user, config), "No idle components found, no notification needed")
        return
    }

    const logComponents = "Components: + " + components.map((c) => c.name).join(", ")

    try {
        const bike = _.find(user.profile.bikes, {id: config.id})
        const shoe = _.find(user.profile.shoes, {id: config.id})
        const gear: StravaGear = bike || shoe
        if (!gear) {
            config.disabled = true
            logger.warn("GearWear.notifyIdle", logHelper.user(user), logHelper.gearwearConfig(user, config), "Gear not found")
            return
        }

        // User has email set? Send via email, otherwise create a notification.
        if (user.email) {
            const template = "GearWearIdle"
            const data = {
                units: units,
                userId: user.id,
                gearId: gear.id,
                gearName: gear.name,
                components: components.map((c) => `- ${c.name} (last updated on ${dayjs(c.dateLastUpdate).format("ll")})`).join("<br>"),
                editLink: `${settings.app.url}gear/edit?id=${gear.id}`
            }

            // Dispatch email to user.
            await mailer.send({
                template: template,
                data: data,
                to: user.email
            })

            logger.info("GearWear.notifyIdle.email", logHelper.user(user), logHelper.gearwearConfig(user, config), logComponents, "Email sent")
        } else {
            const nOptions = {
                title: `Gear ${gear.name} has idle components`,
                body: `Your gear has ${components.length} components that haven't been updated for a while, please double check them.`,
                href: `/gear/edit?id=${gear.id}`,
                gearId: gear.id
            }
            await notifications.createNotification(user, nOptions)

            logger.info("GearWear.notifyIdle.notification", logHelper.user(user), logHelper.gearwearConfig(user, config), "Notification created")
        }
    } catch (ex) {
        logger.error("GearWear.notifyIdle", logHelper.user(user), logHelper.gearwearConfig(user, config), logComponents, ex)
    }
}
