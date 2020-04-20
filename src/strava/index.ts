// Strautomator Core: Strava

import {StravaTokens} from "./types"
import stravaActivities from "./activities"
import stravaAthletes from "./athletes"
import stravaWebhooks from "./webhooks"
import api from "./api"
import logger = require("anyhow")
import querystring = require("querystring")
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
    }

    // AUTH METHODS
    // --------------------------------------------------------------------------

    /**
     * Get the OAuth2 access token based on the provided authorization code.
     * This method will return null when it fails to get the token.
     * @param code The authorization code provided via the callback URL.
     */
    getToken = async (code: string): Promise<StravaTokens> => {
        try {
            let qs = {
                grant_type: "authorization_code",
                client_id: settings.strava.api.clientId,
                client_secret: settings.strava.api.clientSecret,
                redirect_uri: `${settings.app.url}strava/auth/callback`,
                code: code
            }

            // Post data to Strava.
            const tokenUrl = `${settings.strava.api.tokenUrl}?${querystring.stringify(qs)}`
            const res = await api.axios.post(tokenUrl)

            if (res == null || res.data == null) {
                throw new Error("Invalid access token")
            }

            // Save new tokens to database.
            const tokens: StravaTokens = {
                accessToken: res.data.access_token,
                refreshToken: res.data.refresh_token,
                expiresAt: res.data.expires_at
            }

            return tokens
        } catch (ex) {
            logger.error("StravaAPI.getToken", ex)
        }
    }

    /**
     * Refresh OAuth2 tokens from Strava.
     */
    refreshToken = async (refreshToken: string, accessToken?: string): Promise<StravaTokens> => {
        try {
            const qs: any = {
                grant_type: "refresh_token",
                client_id: settings.strava.api.clientId,
                client_secret: settings.strava.api.clientSecret,
                refresh_token: refreshToken
            }

            // Access token was passed?
            if (accessToken) {
                qs.access_token = accessToken
            }

            // Post data to Strava.
            const tokenUrl = `${settings.strava.api.tokenUrl}?${querystring.stringify(qs)}`
            const res = await api.axios.post(tokenUrl)

            if (res == null || res.data == null) {
                throw new Error("Invalid or empty token response")
            }
            // Save new tokens to database.
            const tokens: StravaTokens = {
                accessToken: res.data.access_token,
                refreshToken: res.data.refresh_token,
                expiresAt: res.data.expires_at
            }

            return tokens
        } catch (ex) {
            logger.error("StravaAPI.refreshToken", ex)
        }
    }
}

// Exports...
export default Strava.Instance
