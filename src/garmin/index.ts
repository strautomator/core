// Strautomator Core: Garmin

import {GarminProfile, GarminTokens, OAuth1Token} from "./types"
import {UserData} from "../users/types"
import {AxiosConfig, axiosRequest} from "../axios"
import {Request} from "express"
import {FieldValue} from "@google-cloud/firestore"
import oauth1 from "./oauth1"
import users from "../users"
import cache from "bitecache"
import crypto = require("crypto")
import logger = require("anyhow")
import * as logHelper from "../loghelper"
import querystring from "querystring"
const settings = require("setmeup").settings
const packageVersion = require("../../package.json").version

/**
 * Garmin wrapper.
 */
export class Garmin {
    private constructor() {}
    private static _instance: Garmin
    static get Instance() {
        return this._instance || (this._instance = new this())
    }

    oauth1 = oauth1

    // INIT
    // --------------------------------------------------------------------------

    /**
     * Init the Garmin wrapper.
     */
    init = async (): Promise<void> => {
        try {
            const nodeEnv = process.env.NODE_ENV

            if (nodeEnv != "test") {
                if (!settings.garmin.api.clientId) {
                    throw new Error("Missing the garmin.api.clientId setting")
                }
                if (!settings.garmin.api.clientSecret) {
                    throw new Error("Missing the garmin.api.clientSecret setting")
                }
            }

            cache.setup("garmin", settings.garmin.cacheDuration)
        } catch (ex) {
            logger.error("Garmin.init", ex)
        }
    }

    /**
     * Dispatch a request to the Garmin API.
     * @param tokens Access tokens.
     * @param path API path.
     * @param method HTTP method, defaults to GET.
     */
    private makeRequest = async (tokens: GarminTokens, path: string, method?: string): Promise<any> => {
        const options: AxiosConfig = {
            method: method || "GET",
            returnResponse: true,
            url: `${settings.garmin.api.baseUrl}${path}`,
            headers: {}
        }

        const oauthData = this.oauth1.getData(options, tokens.accessToken, tokens.tokenSecret)
        options.headers["Authorization"] = this.oauth1.getHeader(oauthData)
        options.headers["User-Agent"] = `${settings.app.title} / ${packageVersion}`

        try {
            const res = await axiosRequest(options)
            return res ? res.data : null
        } catch (ex) {
            logger.error("Garmin.makeRequest", path, ex)
            throw ex
        }
    }

    /**
     * Dispatch a token request to the Garmin API.
     * @param path Token request path.
     * @param token Optional unauthenticated token.
     * @param secret Optional token secret.
     * @param verifier Optional verifier code.
     */
    private makeTokenRequest = async (path: "access_token" | "request_token", token?: string, secret?: string, verifier?: string): Promise<OAuth1Token> => {
        try {
            const reqOptions: AxiosConfig = {
                url: `${settings.garmin.api.authUrl}${path}`,
                method: "POST",
                headers: {}
            }

            // Set oauth data.
            const oauthData = this.oauth1.getData(reqOptions, token, secret, verifier)
            reqOptions.data = oauthData
            reqOptions.headers.Authorization = this.oauth1.getHeader(oauthData)

            // Parse response string as a OAuth1Token object.
            const tokenData: string = await axiosRequest(reqOptions)
            if (tokenData) {
                return querystring.parse(tokenData) as any
            }

            throw new Error(`Invalid token response: ${tokenData}`)
        } catch (ex) {
            logger.error("Garmin.makeTokenRequest", path, ex)
            throw ex
        }
    }

    // AUTH
    // --------------------------------------------------------------------------

    /**
     * Generate a new authentication URL for the user.
     * @param user The user requesting the auth URL.
     */
    generateAuthUrl = async (user: UserData): Promise<string> => {
        const tokens = await this.makeTokenRequest("request_token")

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
            const tokenData: OAuth1Token = await this.makeTokenRequest("access_token", oToken, arrStateToken.join("-"), oVerifier)

            // Make sure user has a Garmin profile object.
            if (!user.garmin) {
                user.garmin = {} as any
            }

            // If token request was successful, now get and save the user profile.
            user.garmin.tokens = {accessToken: tokenData.oauth_token, tokenSecret: tokenData.oauth_token_secret}
            const profile = await this.getProfile(user)
            await this.saveProfile(user, profile)

            delete user.garminAuthState
        } catch (ex) {
            logger.error("Garmin.processAuthCallback", user ? logHelper.user(user) : "Unknown user", `State ${req.query.state}`, ex)
            throw ex
        }
    }

    // PROFILE DATA
    // --------------------------------------------------------------------------

    /**
     * Get a Garmin profile for the specified user.
     * @param user User requesting the Garmin data.
     */
    getProfile = async (user: UserData): Promise<GarminProfile> => {
        try {
            const cacheId = `profile-${user.id}`
            const cached: GarminProfile = cache.get("garmin", cacheId)
            if (cached) {
                logger.info("Garmin.getProfile", logHelper.user(user), `ID ${cached.id}`, "From cache")
                return cached
            }

            const tokens = user.garmin.tokens

            // Make request to fetch profile.
            const res = await this.makeRequest(tokens, "wellness-api/rest/user/id")
            const profile: GarminProfile = {
                id: res.userId,
                tokens: tokens
            }

            // Save to cache and return the user profile.
            cache.set("garmin", cacheId, profile)
            logger.info("Garmin.getProfile", logHelper.user(user), `ID ${profile.id}`)
            return profile
        } catch (ex) {
            logger.error("Garmin.getProfile", logHelper.user(user), ex)
            throw ex
        }
    }

    /**
     * Save the Garmin profile to the specified user account.
     * @param user The user.
     * @param profile The Garmin profile with tokens.
     */
    saveProfile = async (user: UserData, profile: GarminProfile): Promise<void> => {
        try {
            user.garmin = profile

            const data: Partial<UserData> = {id: user.id, displayName: user.displayName, garmin: profile}
            if (user.garminAuthState) {
                data.garminAuthState = FieldValue.delete() as any
            }

            await users.update(data)
        } catch (ex) {
            logger.error("Garmin.saveProfile", logHelper.user(user), `ID ${profile.id}`, ex)
        }
    }

    /**
     * Unlink the registration and delete the user profile data.
     * @param user User requesting the Garmin data.
     */
    deleteProfile = async (user: UserData): Promise<void> => {
        try {
            if (!user.garmin) {
                logger.warn("Garmin.deleteProfile", logHelper.user(user), "User has no Garmin profile, abort")
                return
            }

            const cacheId = `profile-${user.id}`
            const profileId = user.garmin.id
            const tokens = user.garmin.tokens

            // Make request to unlink profile.
            await this.makeRequest(tokens, "wellness-api/rest/user/registration", "DELETE")

            // Remove profile from the database.
            const data: Partial<UserData> = {id: user.id, displayName: user.displayName, garmin: FieldValue.delete() as any}
            await users.update(data)

            cache.del("garmin", cacheId)
            logger.info("Garmin.deleteProfile", logHelper.user(user), `ID ${profileId} unlinked`)
        } catch (ex) {
            logger.error("Garmin.deleteProfile", logHelper.user(user), ex)
            throw ex
        }
    }
}

// Exports...
export default Garmin.Instance
