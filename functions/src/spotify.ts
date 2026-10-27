// Strautomator Functions: Spotify

import {AuthNotification, UserData} from "strautomator-core"
import {FieldValue} from "@google-cloud/firestore"
import core = require("strautomator-core")
import _ from "lodash"
import dayjs from "dayjs"
import dayjsDayOfYear from "dayjs/plugin/dayOfYear"
import dayjsLocalizedFormat from "dayjs/plugin/localizedFormat"
import logger from "anyhow"
const settings = require("setmeup").settings
dayjs.extend(dayjsDayOfYear)
dayjs.extend(dayjsLocalizedFormat)

/**
 * Helper to get the refresh token expiry date of a user, as a plain YYYY-MM-DD string.
 * Returns null if the user has no refresh token expiry date set.
 * @param user The user.
 */
const refreshExpiryDay = (user: UserData): string | null => {
    const dateExpiry = user.spotify?.dateRefreshExpiry
    return dateExpiry ? dayjs(dateExpiry).format("YYYY-MM-DD") : null
}

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

/**
 * Check the Spotify refresh token expiration for all users with a linked Spotify account.
 * Users are warned (notification and email) on the days defined by the "reauthNotifyDays"
 * setting, and have their Spotify profile unlinked once the token has expired.
 */
export const checkSpotify = async () => {
    logger.info("F.Spotify.checkSpotify.start")

    try {
        const now = dayjs().startOf("day")
        const today = now.format("YYYY-MM-DD")
        const warningDays: string[] = settings.spotify.reauthNotifyDays.map((d: number) => now.add(d, "days").format("YYYY-MM-DD"))
        const users = await core.users.getWithSpotify()
        let warned = 0
        let unlinked = 0

        for (let user of users) {
            try {
                const expiryDay = refreshExpiryDay(user)
                if (!expiryDay) continue

                const dateExpiry = dayjs(user.spotify.dateRefreshExpiry)

                // Token has expired? Unlink the Spotify profile and let the user know about it.
                if (expiryDay <= today) {
                    const nOptions: Partial<AuthNotification> = {
                        title: "Spotify account unlinked",
                        body: "Your Spotify authentication has expired, so the account was unlinked from Strautomator. Please login to Spotify again if you wish to keep using its features.",
                        href: "/account?spotify=link",
                        auth: true,
                        source: "spotify"
                    }
                    await core.notifications.createNotification(user, nOptions)

                    const updatedUser: Partial<UserData> = {
                        id: user.id,
                        displayName: user.displayName,
                        spotify: FieldValue.delete() as any,
                        spotifyAuthState: FieldValue.delete() as any,
                        spotifyFailures: FieldValue.delete() as any
                    }
                    await core.users.update(updatedUser)
                    delete user.spotify

                    unlinked++
                    continue
                }

                // Not on one of the warning days? Stop here.
                if (!warningDays.includes(expiryDay)) continue

                const days = dateExpiry.diff(now, "days")
                const nOptions: Partial<AuthNotification> = {
                    title: core.spotify.reauthNotificationTitle,
                    body: `Spotify requires you to authenticate again every few months. Your Spotify account will be unlinked in ${days} day(s), on ${dateExpiry.format("ll")}, so please login again to keep using it with Strautomator.`,
                    href: "/account?spotify=link",
                    auth: true,
                    source: "spotify",
                    dateExpiry: dateExpiry.toDate()
                }
                await core.notifications.createNotification(user, nOptions)

                if (user.email) {
                    await core.mailer.send({
                        to: user.email,
                        template: "SpotifyTokenExpiring",
                        data: {
                            userId: user.id,
                            userName: user.profile.firstName || user.displayName,
                            days: days,
                            expiryDate: dateExpiry.format("ll")
                        }
                    })
                }

                warned++
            } catch (userEx) {
                logger.error("F.Spotify.checkSpotify", core.logHelper.user(user), userEx)
            }
        }

        logger.info("F.Spotify.checkSpotify", `Warned ${warned} users`, `Unlinked ${unlinked} users`)
    } catch (ex) {
        logger.error("F.Spotify.checkSpotify", ex)
    }
}
