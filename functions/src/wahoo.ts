// Strautomator Functions: Wahoo

import core = require("strautomator-core")
import _ from "lodash"
import dayjs from "dayjs"
import dayjsDayOfYear from "dayjs/plugin/dayOfYear"
import logger from "anyhow"
const settings = require("setmeup").settings
dayjs.extend(dayjsDayOfYear)

/**
 * Refresh Wahoo tokens and profiles for users with expired tokens.
 */
export const refreshTokens = async () => {
    logger.info("F.Wahoo.refreshTokens.start")

    try {
        const now = dayjs()
        const users = await core.users.getWithWahoo()
        let count = 0

        const refreshToken = async (user) => {
            if (user.wahoo.tokens.expiresAt <= now.unix()) {
                const tokens = await core.wahoo.refreshToken(user)
                const profile = await core.wahoo.profiles.getProfile(user, tokens)
                await core.wahoo.profiles.saveProfile(user, profile)
                count++
            }
        }

        // Refresh tokens in batches.
        const batchSize = settings.functions.batchSize
        while (users.length) {
            await Promise.allSettled(users.splice(0, batchSize).map(refreshToken))
        }

        logger.info("F.Wahoo.refreshTokens", `Refreshed ${count} profiles`)
    } catch (ex) {
        logger.error("F.Wahoo.refreshTokens", ex)
    }
}
