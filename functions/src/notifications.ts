// Strautomator Functions: Notifications

import core = require("strautomator-core")
import logger from "anyhow"

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
