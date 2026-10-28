// Strautomator Functions: Wahoo

import {UserData} from "strautomator-core"
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
export const refreshProfiles = async () => {
    logger.info("F.Wahoo.refreshProfiles.start")

    try {
        const now = dayjs()
        const users = await core.users.getWithWahoo()
        let count = 0

        const refreshToken = async (user: UserData) => {
            if (user.wahoo.tokens.expiresAt < now.unix()) {
                await core.wahoo.profiles.refreshProfile(user)
                count++
            }
        }

        // Refresh tokens in batches.
        const batchSize = settings.functions.batchSize
        while (users.length) {
            await Promise.allSettled(users.splice(0, batchSize).map(refreshToken))
        }

        logger.info("F.Wahoo.refreshProfiles", `Refreshed ${count} profiles`)
    } catch (ex) {
        logger.error("F.Wahoo.refreshProfiles", ex)
    }
}
