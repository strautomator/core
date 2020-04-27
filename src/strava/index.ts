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
     */
    init = async (): Promise<void> => {
        await api.init()

        eventManager.on("Users.delete", this.onUsersDelete)
    }

    /**
     * Cancel webhooks and revoke token for user after it gets deleted from the database.
     * @param user User that was deleted from the database.
     */
    private onUsersDelete = async (user: UserData): Promise<void> => {
        try {
            await this.webhooks.cancelSubscription(user)
        } catch (ex) {
            logger.error("Users.onUsersDelete", `Failed to cancel webhooks for user ${user.id} - ${user.displayName}`)
        }

        try {
            await this.revokeToken(user.stravaTokens.accessToken)
        } catch (ex) {
            logger.error("Users.onUsersDelete", `Failed to revoke token for user ${user.id} - ${user.displayName}`)
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
     */
    refreshToken = async (refreshToken: string, accessToken?: string): Promise<StravaTokens> => {
        return await api.refreshToken(refreshToken, accessToken)
    }

    /**
     * Revoke the passed access token.
     */
    revokeToken = async (accessToken?: string): Promise<void> => {
        return await api.revokeToken(accessToken)
    }
}

// Exports...
export default Strava.Instance
