// Strautomator Core: Strava

import {StravaTokens} from "./types"
import {UserData} from "../users/types"
import api from "./api"
import stravaActivities from "./activities"
import stravaActivityProcessing from "./activityprocessing"
import stravaAthletes from "./athletes"
import stravaClubs from "./clubs"
import stravaPerformance from "./performance"
import stravaRoutes from "./routes"
import stravaWebhooks from "./webhooks"
import database from "../database"
import eventManager from "../eventmanager"
import dayjs from "../dayjs"
import cache from "bitecache"
import logger from "anyhow"
import * as logHelper from "../loghelper"
const settings = require("setmeup").settings

/**
 * Strava wrapper.
 */
export class Strava {
    private constructor() {}
    private static _instance: Strava
    static get Instance(): Strava {
        return this._instance || (this._instance = new this())
    }

    /**
     * Activity methods.
     */
    activities = stravaActivities

    /**
     * Activity processing methods.
     */
    activityProcessing = stravaActivityProcessing

    /**
     * Athlete methods.
     */
    athletes = stravaAthletes

    /**
     * Club methods.
     */
    clubs = stravaClubs

    /**
     * Performance methods.
     */
    performance = stravaPerformance

    /**
     * Route methods.
     */
    routes = stravaRoutes

    /**
     * Webhook methods.
     */
    webhooks = stravaWebhooks

    /**
     * Helper to check if the Strava API might is currently having an incident based on timeouts.
     */
    get incident(): string {
        const thresholds = settings.strava.api.timeoutThresholds
        const gatewayTimeouts = api.gatewayTimeouts
        if (gatewayTimeouts.count >= thresholds.count && dayjs().subtract(thresholds.seconds, "seconds").isAfter(gatewayTimeouts.last)) {
            const since = dayjs(gatewayTimeouts.first).format("lll")
            return `API connections are timing out since ${since}`
        }
        return null
    }

    // INIT
    // --------------------------------------------------------------------------

    /**
     * Init the Strava wrapper.
     * @param quickStart If true, will not wait to setup Strava webhooks, default is false.
     */
    init = async (quickStart?: boolean): Promise<void> => {
        await api.init()

        cache.setup("processed-activities", settings.strava.processedActivities.cacheDuration)

        // Make sure there's a valid webhook set on Strava.
        try {
            if (!quickStart) {
                await this.webhooks.getWebhook()
            } else {
                this.webhooks.getWebhook()
            }

            if (settings.strava.testMode) {
                logger.warn("Strava.init", "Will not write to Strava, testMode=true")
            }
        } catch (ex) {
            logger.error("Strava.init", ex)
        }

        eventManager.on("Strava.activityDeleted", this.onActivityDeleted)
        eventManager.on("Users.delete", this.onUserDelete)
    }

    /**
     * Remove the activity from the database if it gets deleted on Strava itself.
     * @param user The user.
     * @param activityId The Strava activity ID.
     */
    private onActivityDeleted = async (user: UserData, activityId: string): Promise<void> => {
        const activityLog = `Activity ${activityId}`

        try {
            const count = await database.delete("activities", activityId)
            if (count > 0) {
                logger.info("Strava.onActivityDeleted", logHelper.user(user), activityLog, "Deleted from the database")
            }
        } catch (ex) {
            logger.error("Strava.onActivityDeleted", logHelper.user(user), activityLog, ex)
        }
    }

    /**
     * Cancel webhooks and revoke token for user after it gets deleted from the database.
     * @param user User that was deleted from the database.
     */
    private onUserDelete = async (user: UserData): Promise<void> => {
        try {
            const tokens = user.stravaTokens
            await this.revokeToken(user.id, tokens.accessToken, tokens.refreshToken)
        } catch (ex) {
            logger.error("Strava.onUserDelete", logHelper.user(user), "Failed to revoke Strava token")
        }

        try {
            await this.activityProcessing.deleteProcessedActivities(user)
            await this.athletes.deleteAthleteRecords(user)
        } catch (ex) {
            logger.error("Strava.onUserDelete", logHelper.user(user), ex)
        }
    }

    // AUTH SHORTCUT METHODS
    // --------------------------------------------------------------------------

    /**
     * Get the authentication URL used to start the OAuth2 flow with Strava.
     * @param state State (redirect URL, for example) to be passed along.
     */
    getAuthUrl = (state?: string): string => {
        if (state) {
            state = `&state=${state}`
        } else {
            state = ""
        }

        return `${settings.strava.api.authUrl}?client_id=${settings.strava.api.clientId}&redirect_uri=${settings.app.url}auth/callback&response_type=code&scope=${settings.strava.api.scopes}${state}`
    }

    /**
     * Shortcut to API's getToken().
     * @param code The authorization code provided via the callback URL.
     */
    getToken = async (code: string): Promise<StravaTokens> => {
        return await api.getToken(code)
    }

    /**
     * Shortcut to API's refreshToken().
     * @param refreshToken The refresh token for the user / client.
     * @param accessToken Previous access token.
     * @param noEmit Sometimes we might want to avoid emitting the refreshToken event.
     */
    refreshToken = async (refreshToken: string, accessToken?: string, noEmit?: boolean): Promise<StravaTokens> => {
        return await api.refreshToken(refreshToken, accessToken, noEmit)
    }

    /**
     * Revoke the passed access token.
     * @param userId ID of the token's owner.
     * @param accessToken Access token to be deauthorized.
     * @param refreshToken Optional refresh token, in case the access token fails.
     */
    revokeToken = async (userId: string, accessToken: string, refreshToken?: string): Promise<void> => {
        return await api.revokeToken(userId, accessToken, refreshToken)
    }

    // CACHE
    // --------------------------------------------------------------------------

    /**
     * Deleted cached Strava responses from the database.
     * @param everything If true, will delete also non-expired documents.
     */
    cleanupCache = async (everything?: boolean): Promise<void> => {
        try {
            const now = dayjs()

            // Delete all documents if the everything flag was passed.
            if (everything) {
                const count = await database.delete("strava-cache", [["dateCached", "<", now.toDate()]])
                logger.info("Strava.cleanupCache", `Removed all ${count} cached responses`)
                return
            }

            // Otherwise, delete documents based on the resource type (cacheKey / durations).
            const entries = Object.entries(settings.strava.cacheDuration)
            for (let [cacheKey, duration] of entries) {
                const maxDate = now.subtract(duration as number, "seconds").toDate()
                const where: any[] = [
                    ["resourceType", "==", cacheKey],
                    ["dateCached", "<", maxDate]
                ]

                const count = await database.delete("strava-cache", where)
                logger.info("Strava.cleanupCache", cacheKey, `Removed ${count} cached responses`)
            }
        } catch (ex) {
            logger.error("Strava.cleanupCache", `Everything: ${everything}`, ex)
        }
    }
}

// Exports...
export default Strava.Instance
