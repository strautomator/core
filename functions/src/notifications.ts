// Strautomator Functions: Notifications

import core = require("strautomator-core")
import logger from "anyhow"

/**
 * Delete old notifications from the database.
 */
export const cleanup = async () => {
    logger.info("F.Notifications.cleanup.start")

    try {
        await core.notifications.cleanup()
    } catch (ex) {
        logger.error("F.Notifications.cleanup", ex)
    }
}

/**
 * Send email reminder to users with too many unread notifications.
 */
export const sendEmailReminders = async () => {
    logger.info("F.Notifications.sendEmailReminders.start")

    try {
        await core.notifications.sendEmailReminders()
    } catch (ex) {
        logger.error("F.Notifications.sendEmailReminders", ex)
    }
}
