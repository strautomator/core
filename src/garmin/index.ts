// Strautomator Core: Garmin

import {UserData} from "../users/types"
import {Request} from "express"
import activities from "./activities"
import api from "./api"
import garminCourses from "./courses"
import garminProfiles from "./profiles"
import garminWebhooks from "./webhooks"
import database from "../database"
import eventManager from "../eventmanager"
import users from "../users"
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
     * Garmin courses wrapper.
     */
    courses = garminCourses

    /**
     * Garmin profiles wrapper.
     */
    profiles = garminProfiles

    /**
     * Webhook processing.
     */
    webhooks = garminWebhooks

    // INIT
    // --------------------------------------------------------------------------

    /**
     * Init the Garmin wrapper.
     */
    init = async (): Promise<void> => {
        try {
            await api.init()

            eventManager.on("Garmin.activityFailure", this.onActivityFailure)
            eventManager.on("Users.delete", this.onUserDelete)
            eventManager.on("Users.login", this.onUserLogin)

            cache.setup("garmin", settings.garmin.cacheDuration)
            logger.info("Garmin.init", `Cache profile for up to ${settings.garmin.cacheDuration} seconds`)
        } catch (ex) {
            logger.error("Garmin.init", ex)
            throw ex
        }
    }

    /**
     * Deregister the user's Garmin profile if it keeps failing to fetch activities.
     * @param user The user.
     * @param fitActivity Last Garmin activity details.
     */
    private onActivityFailure = async (user: UserData): Promise<void> => {
        try {
            if (user.garminFailures == settings.oauth.tokenFailuresDisable) {
                logger.warn("Garmin.onActivityFailure", logHelper.user(user), "Will remove the Garmin profile due to too many activity failures")
                await garminProfiles.deleteProfile(user)
            }
        } catch (ex) {
            logger.error("Garmin.onActivityFailure", ex)
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
                await garminProfiles.deleteProfile(user)
            }
        } catch (ex) {
            logger.error("Garmin.onUserDelete", logHelper.user(user), ex)
        }
    }

    /**
     * Exchange the legacy OAuth1 tokens for OAuth2 ones when the user logs in.
     * @param user User that has just logged in.
     */
    private onUserLogin = async (user: UserData): Promise<void> => {
        if (user.garmin?.tokens?.tokenSecret) {
            await garminProfiles.migrateToOAuth2(user)
        }
    }

    // AUTH
    // --------------------------------------------------------------------------

    /**
     * Shortcut to the API's validateTokens(), which will refresh expired OAuth2 tokens.
     * @param user The user to be validated.
     */
    validateTokens = async (user: UserData): Promise<void> => {
        await api.validateTokens(user)
    }

    /**
     * Generate a new OAuth2 (PKCE) authentication URL for the user.
     * @param user The user requesting the auth URL.
     */
    generateAuthUrl = async (user: UserData): Promise<string> => {
        const authState = crypto.randomBytes(8).toString("hex")
        const codeVerifier = crypto.randomBytes(48).toString("hex")
        const codeChallenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url")

        // The code verifier is kept together with the auth state, as it's needed on the callback.
        await users.update({id: user.id, displayName: user.displayName, garminAuthState: `${authState}-${codeVerifier}`})

        const params = new URLSearchParams({
            client_id: settings.garmin.api.clientId,
            response_type: "code",
            code_challenge: codeChallenge,
            code_challenge_method: "S256",
            redirect_uri: api.getRedirectUrl(),
            state: `${user.id}-${authState}`
        })

        logger.info("Garmin.generateAuthUrl", logHelper.user(user), `State: ${authState}`)
        return `${settings.garmin.api.loginUrl}?${params.toString()}`
    }

    /**
     * Get the OAuth2 access token based on the provided auth parameters.
     * This will also trigger an update to the Garmin profile on the database.
     * @param req The request object.
     */
    processAuthCallback = async (req: Request): Promise<any> => {
        let user: UserData

        try {
            if (!req.query.code || !req.query.state) {
                throw new Error("Missing auth code or state")
            }

            // State is prefixed with the user ID.
            const arrState = req.query.state.toString().split("-")
            const userId = arrState.shift()
            const authState = arrState.shift()

            // Pre-validate state value.
            if (!userId || !authState) {
                throw new Error("Invalid state")
            }

            // Validate referenced user.
            user = await users.getById(userId)
            if (!user) {
                throw new Error("Invalid user")
            }

            // Validate state and extract the PKCE code verifier.
            if (!user.garminAuthState || !user.garminAuthState.startsWith(`${authState}-`)) {
                throw new Error(`Invalid auth state: ${authState}`)
            }
            const codeVerifier = user.garminAuthState.substring(authState.length + 1)

            const tokens = await api.getToken(user, req.query.code as string, codeVerifier)

            // Make sure user has a Garmin profile object.
            if (!user.garmin) {
                user.garmin = {} as any
            }

            // If token request was successful, now get and save the user profile.
            user.garmin.tokens = tokens
            const profile = await garminProfiles.getProfile(user)
            await garminProfiles.saveProfile(user, profile)
        } catch (ex) {
            logger.error("Garmin.processAuthCallback", user ? logHelper.user(user) : "Unknown user", `State ${req.query.state}`, ex)
            throw ex
        }
    }
}

// Exports...
export default Garmin.Instance
