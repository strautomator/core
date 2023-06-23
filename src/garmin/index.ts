// Strautomator Core: Garmin

import {OAuth1Token} from "./types"
import {UserData} from "../users/types"
import {Request} from "express"
import activities from "./activities"
import api from "./api"
import profiles from "./profiles"
import webhooks from "./webhooks"
import database from "../database"
import users from "../users"
import eventManager from "../eventmanager"
import cache from "bitecache"
import crypto from "crypto"
import logger from "anyhow"
import * as logHelper from "../loghelper"
const settings = require("setmeup").settings

/**
 * Garmin wrapper.
 */
export class Garmin {
    private constructor() {}
    private static _instance: Garmin
    static get Instance() {
        return this._instance || (this._instance = new this())
    }

    /**
     * Garmin activities wrapper.
     */
    activities = activities

    /**
     * Garmin profiles wrapper.
     */
    profiles = profiles

    /**
     * Webhook processing.
     */
    webhooks = webhooks

    // INIT
    // --------------------------------------------------------------------------

    /**
     * Init the Garmin wrapper.
     */
    init = async (): Promise<void> => {
        try {
            await api.init()

            eventManager.on("Users.delete", this.onUserDelete)

            cache.setup("garmin", settings.garmin.cacheDuration)
            logger.info("Garmin.init", `Cache profile for up to ${settings.garmin.cacheDuration} seconds`)
        } catch (ex) {
            logger.error("Garmin.init", ex)
            throw ex
        }
    }

    /**
     * Deregister from Garmin when user deletes the account.
     * @param user User that was deleted from the database.
     */
    private onUserDelete = async (user: UserData): Promise<void> => {
        try {
            const counter = await database.delete("garmin", ["userId", "==", user.id])
            if (counter > 0) {
                logger.info("Garmin.onUserDelete", logHelper.user(user), `Deleted ${counter} cached Garmin data`)
            }
            if (user.garmin?.tokens?.accessToken) {
                await profiles.deleteProfile(user)
            }
        } catch (ex) {
            logger.error("Garmin.onUserDelete", logHelper.user(user), ex)
        }
    }

    // AUTH
    // --------------------------------------------------------------------------

    /**
     * Generate a new authentication URL for the user.
     * @param user The user requesting the auth URL.
     */
    generateAuthUrl = async (user: UserData): Promise<string> => {
        const tokens = await api.makeTokenRequest("request_token")

        // Set the auth state for the user.
        const authState = crypto.randomBytes(8).toString("hex")
        const state = `${authState}-${tokens.oauth_token_secret}`
        await users.update({id: user.id, displayName: user.displayName, garminAuthState: state})

        // Return final auth URL.
        const baseUrl = settings.api.url || `${settings.app.url}api/`
        const callbackUrl = `${baseUrl}garmin/auth/callback?state=${user.id}-${state}`
        return `${settings.garmin.api.loginUrl}?oauth_token=${tokens.oauth_token}&oauth_callback=${callbackUrl}`
    }

    /**
     * Get the OAuth1 access token based on the provided auth parameters.
     * This will also trigger an update to the Garmin profile on the database.
     * @param req The request object.
     */
    processAuthCallback = async (req: Request): Promise<any> => {
        let user: UserData

        try {
            if (!req.query.oauth_token || !req.query.oauth_verifier || !req.query.state) {
                throw new Error("Missing oauth token or verifier")
            }

            // State is prefixed with the user ID.
            const arrStateToken = req.query.state.toString().split("-")
            const userId = arrStateToken.shift()

            // Pre-validate state value.
            if (!userId || arrStateToken.length < 2) {
                throw new Error("Invalid state")
            }

            // Validate referenced user.
            user = await users.getById(userId)
            if (!user) {
                throw new Error("Invalid user")
            }

            // Validate state.
            const state = arrStateToken.shift()
            if (!user.garminAuthState.includes(state)) {
                throw new Error(`Invalid auth state: ${state}`)
            }

            const oToken = req.query.oauth_token as string
            const oVerifier = req.query.oauth_verifier as string
            const tokenData: OAuth1Token = await api.makeTokenRequest("access_token", oToken, arrStateToken.join("-"), oVerifier)

            // Make sure user has a Garmin profile object.
            if (!user.garmin) {
                user.garmin = {} as any
            }

            // If token request was successful, now get and save the user profile.
            user.garmin.tokens = {accessToken: tokenData.oauth_token, tokenSecret: tokenData.oauth_token_secret}
            const profile = await profiles.getProfile(user)
            await profiles.saveProfile(user, profile)
        } catch (ex) {
            logger.error("Garmin.processAuthCallback", user ? logHelper.user(user) : "Unknown user", `State ${req.query.state}`, ex)
            throw ex
        }
    }
}

// Exports...
export default Garmin.Instance
