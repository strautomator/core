// Strautomator Core: Strava

import {StravaTokens} from "./types"
import {UserData} from "../users/types"
import stravaActivities from "./activities"
import stravaAthletes from "./athletes"
import stravaWebhooks from "./webhooks"
import api from "./api"
import eventManager from "../eventmanager"
import logger = require("anyhow")
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
     * Atlhete methods.
     */
    athletes = stravaAthletes

    /**
     * Webhook methods.
     */
    webhooks = stravaWebhooks

    /**
     * The authentication URL used to start the OAuth2 flow with Strava.
     */
    get authUrl(): string {
        return `${settings.strava.api.authUrl}?client_id=${settings.strava.api.clientId}&redirect_uri=${settings.app.url}auth/callback&response_type=code&scope=${settings.strava.api.scopes}`
    }

    // INIT
    // --------------------------------------------------------------------------

    /**
     * Init the Strava wrapper.
     * @param quickStart If true, will not wait to setup Strava webhooks, default is false.
     */
    init = async (quickStart?: boolean): Promise<void> => {
        await api.init()

        // Make sure there's a valid webhook set on Strava.
        try {
            if (!quickStart) {
                await this.webhooks.getWebhook()
            } else {
                this.webhooks.getWebhook()
            }
        } catch (ex) {
            logger.error("Strava.init", ex)
        }

        eventManager.on("Users.delete", this.onUserDelete)
    }

    /**
     * Cancel webhooks and revoke token for user after it gets deleted from the database.
     * @param user User that was deleted from the database.
     */
    private onUserDelete = async (user: UserData): Promise<void> => {
        try {
            await this.revokeToken(user.stravaTokens.accessToken, user.id)
        } catch (ex) {
            logger.error("Strava.onUsersDelete", `Failed to revoke token for user ${user.id} - ${user.displayName}`)
        }
    }

    // AUTH SHORTCUT METHODS
    // --------------------------------------------------------------------------

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
     */
    refreshToken = async (refreshToken: string, accessToken?: string): Promise<StravaTokens> => {
        return await api.refreshToken(refreshToken, accessToken)
    }

    /**
     * Revoke the passed access token.
     * @param accessToken Access token to be deauthorized.
     * @param userId ID of the token's owner.
     */
    revokeToken = async (accessToken: string, userId: string): Promise<void> => {
        return await api.revokeToken(accessToken, userId)
    }
}

// Exports...
export default Strava.Instance
