// Strautomator Functions: GearWear

import {GearWearDbState} from "strautomator-core"
import core = require("strautomator-core")
import dayjs from "dayjs"
import logger from "anyhow"
const settings = require("setmeup").settings

/**
 * Process recent Strava activities and update GearWear stats.
 */
export const processRecentActivities = async () => {
    logger.info("F.GearWear.processRecentActivities.start")

    try {
        await core.gearwear.processRecentActivities()

        const state: GearWearDbState = await core.database.appState.get("gearwear")

        if (state.recentActivityCount > 0) {
            logger.info("F.GearWear.processRecentActivities", "OK")
        } else {
            logger.info("F.GearWear.processRecentActivities", "No activities processed recently")
        }
    } catch (ex) {
        logger.error("F.GearWear.processRecentActivities", ex)
    }
}

/**
 * Notify users about recently updated GearWear configurations with idle components.
 */
export const notifyRecentIdle = async () => {
    logger.info("F.GearWear.notifyRecentIdle.start")

    try {
        const now = dayjs()
        const since = now.subtract(1, "month").startOf("day")
        const configs = await core.gearwear.getUpdatedSince(since)

        for (let config of configs) {
            if (config.disabled) {
                logger.warn("F.GearWear.notifyIdle", `User ${config.userId}`, `Gear ${config.id} is disabled, skipping`)
                continue
            }

            // Get user and check if the Gear has idle components.
            const user = await core.users.getById(config.userId)
            const minDate = now.subtract(settings.gearwear.idleReminderDays, "days")
            const idleComponents = config.components.filter((c) => dayjs(c.dateLastUpdate).isBefore(minDate) && dayjs(c.dateAlertSent).isBefore(minDate))
            if (idleComponents.length > 0) {
                await core.gearwear.notifyIdle(user, config, idleComponents)
            }
        }
    } catch (ex) {
        logger.error("F.GearWear.notifyRecentIdle", ex)
    }
}
