// Strautomator Core: Wahoo

import {WahooTokens} from "./types"
import {UserData} from "../users/types"
import {Request} from "express"
import api from "./api"
import wahooActivities from "./activities"
import wahooProfiles from "./profiles"
import wahooWebhooks from "./webhooks"
import eventManager from "../eventmanager"
import database from "../database"
import users from "../users"
import _ from "lodash"
import cache from "bitecache"
import crypto from "crypto"
import logger from "anyhow"
import * as logHelper from "../loghelper"
const settings = require("setmeup").settings

/**
 * Wahoo wrapper.
 */
export class Wahoo {
    private constructor() {}
    private static _instance: Wahoo
    static get Instance() {
        return this._instance || (this._instance = new this())
    }

    /**
     * Activity methods.
     */
    activities = wahooActivities

    /**
     * Profile methods.
     */
    profiles = wahooProfiles

    /**
     * Webhooks methods.
     */
    webhooks = wahooWebhooks

    // INIT
    // --------------------------------------------------------------------------

    /**
     * Init the Wahoo wrapper.
     */
    init = async (): Promise<void> => {
        try {
            await api.init()

            eventManager.on("Users.delete", this.onUserDelete)

            cache.setup("wahoo", settings.wahoo.cacheDuration)
            logger.info("Wahoo.init", `Cache profile for up to ${settings.wahoo.cacheDuration} seconds`)
        } catch (ex) {
            logger.error("Wahoo.init", ex)
            throw ex
        }
    }

    /**
     * Deregister from Wahoo when user deletes the account.
     * @param user User that was deleted from the database.
     */
    private onUserDelete = async (user: UserData): Promise<void> => {
        try {
            const counter = await database.delete("wahoo", ["userId", "==", user.id])
            if (counter > 0) {
                logger.info("Wahoo.onUserDelete", logHelper.user(user), `Deleted ${counter} cached Wahoo data`)
            }
            if (user.wahoo?.tokens?.accessToken) {
                await wahooProfiles.deleteProfile(user)
            }
        } catch (ex) {
            logger.error("Wahoo.onUserDelete", logHelper.user(user), ex)
        }
    }

    // AUTH SHORTCUT METHODS
    // --------------------------------------------------------------------------

    /**
     * Get the authentication URL used to start the OAuth2 flow with Wahoo.
     * @param user The user wanting to login to Wahoo.
     */
    getAuthUrl = async (user: UserData): Promise<string> => {
        const baseUrl = settings.api.url || `${settings.app.url}api/`
        const redirectUrl = `${baseUrl}wahoo/auth/callback`
        const authState = crypto.randomBytes(8).toString("hex")
        const state = `${user.id}-${authState}`

        await users.update({id: user.id, displayName: user.displayName, wahooAuthState: authState})
        logger.info("Spotify.generateAuthUrl", logHelper.user(user), `State: ${authState}`)

        return `${settings.wahoo.api.baseUrl}oauth/authorize?client_id=${settings.wahoo.api.clientId}&redirect_uri=${redirectUrl}&response_type=code&state=${state}&scope=${settings.wahoo.api.scopes}`
    }

    /**
     * Shortcut to API's getToken().
     * @param user The user logging to Wahoo.
     * @param code The authorization code provided via the callback URL.
     */
    getToken = async (user: UserData, code: string): Promise<WahooTokens> => {
        return await api.getToken(user, code)
    }

    /**
     * Shortcut to API's refreshToken().
     * @param user The user refreshing a token.
     * @param refreshToken The refresh token for the user / client.
     */
    refreshToken = async (user: UserData, refreshToken?: string): Promise<WahooTokens> => {
        return await api.refreshToken(user, refreshToken)
    }

    /**
     * Revoke the passed access token.
     * @param user The user to be deauthorized.
     */
    revokeToken = async (user: UserData): Promise<void> => {
        return await api.revokeToken(user)
    }

    /**
     * Get the OAuth2 access token based on the provided authorization code
     * and save the referenced Wahoo profile.
     * @param req The request object.
     */
    processAuthCode = async (req: Request): Promise<void> => {
        let user: UserData

        try {
            if (!req.query.code || !req.query.state) {
                throw new Error("Missing code or state on query")
            }

            // State is prefixed with the user ID.
            const arrState = req.query.state.toString().split("-")
            const userId = arrState[0]
            if (!userId || arrState.length != 2) {
                throw new Error("Invalid auth state")
            }

            // Validate referenced user.
            const user = await users.getById(userId)
            if (!user) {
                throw new Error("Invalid user")
            }
            if (user.wahooAuthState != arrState[1]) {
                throw new Error("Invalid auth state")
            }

            const tokens = await this.getToken(user, req.query.code as string)
            const profile = await this.profiles.getProfile(user, tokens)
            await this.profiles.saveProfile(user, profile)

            logger.info("Wahoo.processAuthCode", logHelper.user(user), `Authenticated ${profile.id}`)
        } catch (ex) {
            logger.error("Wahoo.processAuthCode", user ? logHelper.user(user) : "Unknown user", ex)
            throw ex
        }
    }
}

// Exports...
export default Wahoo.Instance
