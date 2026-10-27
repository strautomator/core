// Strautomator Functions: Garmin

import {UserData} from "strautomator-core"
import core = require("strautomator-core")
import logger from "anyhow"
const settings = require("setmeup").settings

/**
 * Refresh the OAuth2 tokens of users with a linked Garmin account. This also keeps
 * the refresh tokens of idle users from expiring.
 */
export const refreshTokens = async () => {
    logger.info("F.Garmin.refreshTokens.start")

    try {
        const users = await core.users.getWithGarmin()
        let count = 0

        const refreshUser = async (user: UserData) => {
            if (!user.garmin.tokens?.refreshToken) return
            await core.garmin.validateTokens(user)
            count++
        }

        // Refresh tokens in batches.
        const batchSize = settings.functions.batchSize
        while (users.length) {
            await Promise.allSettled(users.splice(0, batchSize).map(refreshUser))
        }

        logger.info("F.Garmin.refreshTokens", `Refreshed ${count} users`)
    } catch (ex) {
        logger.error("F.Garmin.refreshTokens", ex)
    }
}
