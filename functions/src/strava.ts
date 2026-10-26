// Strautomator Functions: Strava

import {FieldValue} from "@google-cloud/firestore"
import core = require("strautomator-core")
import logger from "anyhow"
import dayjs from "dayjs"
import _ from "lodash"
const settings = require("setmeup").settings

/**
 * Check the Strava API status.
 */
export const apiCheckStatus = async () => {
    logger.info("F.Strava.apiCheckStatus.start")

    try {
        let incident: any = core.strava.incident || null

        try {
            const res = await fetch("https://status.strava.com/api/v2/summary.json", {signal: AbortSignal.timeout(settings.oauth.tokenTimeout)})
            const data = await res.json()

            if (data.incidents?.length > 0) {
                const details = _.find(data.incidents, (i) => i.impact.toLowerCase() == "critical" || i.impact.toLowerCase() == "major")
                if (details && !details.resolved_at) {
                    incident = details.name
                }
            }
        } catch (fetchEx) {
            logger.error("F.Strava.apiCheckStatus", "Could not fetch status from Strava", fetchEx)
        }

        if (incident) {
            logger.info("F.Strava.apiCheckStatus", `Incident: ${incident}`)
        } else {
            incident = FieldValue.delete()
        }

        await core.database.appState.set("strava", {incident: incident, dateIncidentCheck: new Date()})
    } catch (ex) {
        logger.error("F.Strava.apiCheckStatus", ex)
    }
}

/**
 * Refresh expired Strava access tokens.
 */
export const refreshTokens = async () => {
    logger.info("F.Strava.refreshTokens.start")

    try {
        const users = await core.users.getExpired()
        let counter = 0

        for (let user of users) {
            try {
                await core.strava.refreshToken(user.stravaTokens.refreshToken, user.stravaTokens.accessToken)
                counter++
            } catch (ex) {
                logger.error("F.Strava.refreshTokens", `Can't refresh tokens for user ${user.id} ${user.displayName}`)
            }
        }

        logger.info("F.Strava.refreshTokens", `Total ${users.length} users, ${counter} refreshed tokens`)
    } catch (ex) {
        logger.error("F.Strava.refreshTokens", ex)
    }
}

/**
 * Make sure webhook is registered on Strava.
 */
export const setupWebhook = async () => {
    logger.info("F.Strava.setupWebhook.start")

    try {
        const current = await core.strava.webhooks.getWebhook()

        if (!current) {
            await core.strava.webhooks.createWebhook()
            logger.info("F.Strava.setupWebhook", `ID ${core.strava.webhooks.current.id}`)
        }
    } catch (ex) {
        logger.error("F.Strava.setupWebhook", ex)
    }
}

/**
 * Remove expired cached Strava responses.
 */
export const cleanupCache = async () => {
    logger.info("F.Strava.cleanupCache.start")

    try {
        logger.info("F.Strava.cleanupCache")
    } catch (ex) {
        logger.error("F.Strava.cleanupCache", ex)
    }
}

/**
 * Remove dangling / expired activities from the processing queue.
 */
export const cleanupQueuedActivities = async () => {
    logger.info("F.Strava.cleanupQueuedActivities.start")

    try {
        const beforeDate = dayjs().subtract(settings.strava.processingQueue.maxAge, "seconds").toDate()
        const activities = await core.strava.activityProcessing.getQueuedActivities(beforeDate)

        for (let activity of activities) {
            await core.strava.activityProcessing.deleteQueuedActivity(activity)
        }

        logger.info("F.Strava.cleanupQueuedActivities", `Removed ${activities.length || "no"} activities`)
    } catch (ex) {
        logger.error("F.Strava.cleanupQueuedActivities", ex)
    }
}

/**
 * Remove old processed activities from the database.
 */
export const cleanupOldActivities = async (): Promise<void> => {
    logger.info("F.Strava.cleanupOldActivities.start")

    try {
        const count = await core.strava.activityProcessing.deleteProcessedActivities(null, settings.strava.processedActivities.maxAgeDays)
        const stats = await core.database.appState.get("stats")

        const expiredTotal = (stats.activities?.expired || 0) + count
        await core.database.appState.set("stats", {activities: {expired: expiredTotal}})

        logger.info("F.Strava.cleanupOldActivities", `Removed ${count || "no"} activities now`, `New expired total: ${expiredTotal}`)
    } catch (ex) {
        logger.error("F.Strava.cleanupOldActivities", ex)
    }
}

/**
 * Count how many activities were processed. Please note that activities are deleted after
 * some years, and these will be counted at deletion-time in the expired field (see above).
 */
export const countActivities = async (): Promise<any> => {
    logger.info("F.Strava.countActivities")

    try {
        const total = await core.database.count("activities")
        const withLinkback = await core.database.count("activities", ["linkback", "==", true])

        logger.info("F.Strava.countActivities", `Total: ${total}`, `With linkback: ${withLinkback}`)
        return {total: total, withLinkback: withLinkback}
    } catch (ex) {
        logger.error("F.Strava.countActivities", ex)
    }
}
