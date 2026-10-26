// Strautomator Functions: Spotify

import core = require("strautomator-core")
import _ from "lodash"
import dayjs from "dayjs"
import dayjsDayOfYear from "dayjs/plugin/dayOfYear"
import logger from "anyhow"
const settings = require("setmeup").settings
dayjs.extend(dayjsDayOfYear)

/**
 * Refresh (some) Spotify tokens and profiles for users with expired tokens.
 */
export const refreshTokens = async () => {
    logger.info("F.Spotify.refreshTokens.start")

    try {
        const now = dayjs()
        const spotifyUsers = await core.users.getWithSpotify()
        const users = _.sampleSize(_.shuffle(spotifyUsers), Math.round(spotifyUsers.length / 2))
        let count = 0

        const refreshToken = async (user) => {
            if (user.spotify.tokens.expiresAt <= now.unix()) {
                const tokens = await core.spotify.refreshToken(user)
                const profile = await core.spotify.getProfile(user, tokens)
                await core.spotify.saveProfile(user, profile)
                count++
            }
        }

        // Refresh tokens in batches.
        const batchSize = settings.functions.batchSize
        while (users.length) {
            await Promise.allSettled(users.splice(0, batchSize).map(refreshToken))
        }

        logger.info("F.Spotify.refreshTokens", `Refreshed ${count} profiles`)
    } catch (ex) {
        logger.error("F.Spotify.refreshTokens", ex)
    }
}
