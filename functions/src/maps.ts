// Strautomator Functions: Maps

import core = require("strautomator-core")
import logger from "anyhow"

/**
 * Delete expired map data from the database.
 */
export const cleanup = async () => {
    logger.info("F.Notifications.cleanup.start")

    try {
        await core.maps.cleanup()
    } catch (ex) {
        logger.error("F.Maps.cleanup", ex)
    }
}
