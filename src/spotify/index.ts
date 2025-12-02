// Strautomator Core: Spotify

import {SpotifyProfile, SpotifyRequestOptions, SpotifyTokens, SpotifyTrack} from "./types"
import {toSpotifyTrack} from "./utils"
import {StravaActivity} from "../strava/types"
import {UserData} from "../users/types"
import {AxiosConfig, axiosRequest} from "../axios"
import {FieldValue} from "@google-cloud/firestore"
import {Request} from "express"
import eventManager from "../eventmanager"
import users from "../users"
import _ from "lodash"
import cache from "bitecache"
import crypto from "crypto"
import jaul from "jaul"
import logger from "anyhow"
import * as logHelper from "../loghelper"
import dayjs from "../dayjs"
const settings = require("setmeup").settings

/**
 * Spotify API wrapper.
 */
export class Spotify {
    private constructor() {}
    private static _instance: Spotify
    static get Instance() {
        return this._instance || (this._instance = new this())
    }

    /**
     * Spotify requests should wait till this timestamp before proceeding.
     */
    rateLimitedUntil: number = 0

    // INIT
    // --------------------------------------------------------------------------

    /**
     * Init the Spotify wrapper.
     */
    init = async (): Promise<void> => {
        try {
            if (!settings.spotify.api.clientId) {
                throw new Error("Missing the spotify.api.clientId setting")
            }
            if (!settings.spotify.api.clientSecret) {
                throw new Error("Missing the spotify.api.clientSecret setting")
            }

            cache.setup("spotify", settings.spotify.cacheDuration)
            logger.info("Spotify.init", `Cache profile for up to ${settings.spotify.cacheDuration} seconds`)
        } catch (ex) {
            logger.error("Spotify.init", ex)
            throw ex
        }
    }

    /**
     * Make a request to the Spotify API.
     * @param reqOptions Spotify request options.
     */
    private makeRequest = async (reqOptions: SpotifyRequestOptions): Promise<any> => {
        const now = dayjs().unix()

        // Set final headers.
        if (!reqOptions.headers) {
            reqOptions.headers = {}
        }
        if (reqOptions.tokens) {
            reqOptions.headers.Authorization = `Bearer ${reqOptions.tokens.accessToken}`
        }

        //  Defaults to GET.
        if (!reqOptions.method) {
            reqOptions.method = "GET"
        }

        // Transform to axios specific options.
        const options: AxiosConfig = {
            method: reqOptions.method,
            returnResponse: true,
            url: reqOptions.url || `${settings.spotify.api.baseUrl}${reqOptions.path}`,
            timeout: reqOptions.tokens ? settings.oauth.tokenTimeout : null,
            headers: reqOptions.headers
        }
        if (reqOptions.data) {
            options.data = reqOptions.data
        }

        // If we hit the rate limit, make sure to wait before proceeding.
        if (this.rateLimitedUntil > now) {
            const diff = this.rateLimitedUntil - now
            logger.warn("Spotify.makeRequest", reqOptions.method, reqOptions.url || reqOptions.path, `Rate limited, will wait ${diff} seconds before proceeding`)
            await jaul.io.sleep(diff * 1050)
        }

        // Dispatch the request now.
        try {
            const res = await axiosRequest(options)
            return res ? res.data || res : null
        } catch (ex) {
            const status = ex.response?.status || null
            const headers = ex.response?.headers || null

            // Rate limited? Try again later.
            if (status == 429 && headers["retry-after"]) {
                const seconds = parseInt(headers["retry-after"])
                logger.error("Spotify.makeRequest", reqOptions.method, reqOptions.url || reqOptions.path, `Rate limited, will try again in around ${seconds}s`)

                if (this.rateLimitedUntil <= now) {
                    this.rateLimitedUntil = now + seconds
                }

                await jaul.io.sleep(seconds * 1050)
                try {
                    const res = await axiosRequest(options)
                    return res ? res.data || res : null
                } catch (innerEx) {
                    logger.error("Spotify.makeRequest", reqOptions.method, reqOptions.url || reqOptions.path, "Failed again, won't retry", ex)
                    throw ex
                }
            }

            logger.error("Spotify.makeRequest", reqOptions.method, reqOptions.url || reqOptions.path, ex)
            throw ex
        }
    }

    // AUTH
    // --------------------------------------------------------------------------

    /**
     * Generate an authentication URL for the specified user. The "state" will be saved
     * to the user profile on the database.
     * @param user The user wanting to login to Spotify.
     */
    generateAuthUrl = async (user: UserData): Promise<string> => {
        const baseUrl = settings.api.url || `${settings.app.url}api/`
        const authState = crypto.randomBytes(8).toString("hex")
        const state = `${user.id}-${authState}`

        await users.update({id: user.id, displayName: user.displayName, spotifyAuthState: authState})
        logger.info("Spotify.generateAuthUrl", logHelper.user(user), `State: ${authState}`)

        return `${settings.spotify.api.authUrl}?client_id=${settings.spotify.api.clientId}&redirect_uri=${baseUrl}spotify/auth/callback&response_type=code&scope=${settings.spotify.api.scopes}&state=${state}`
    }

    /**
     * Get the OAuth2 access token based on the provided authorization code.
     * This will also trigger an update to the Spotify profile on the database.
     * @param req The request object.
     */
    processAuthCode = async (req: Request): Promise<SpotifyProfile> => {
        let user: UserData

        try {
            if (!req.query.code || !req.query.state) {
                throw new Error("Missing code or state on query")
            }

            // State is prefixed with the user ID.
            const arrState = req.query.state.toString().split("-")
            const userId = arrState[0]

            // Validate state value.
            if (!userId || arrState.length != 2) {
                throw new Error("Invalid state")
            }

            // Validate referenced user.
            user = await users.getById(userId)
            if (!user) {
                throw new Error("Invalid user")
            }
            if (user.spotifyAuthState != arrState[1]) {
                throw new Error(`Invalid auth state: ${arrState[1]}`)
            }

            const tokens = await this.getToken(user, req.query.code as string)
            const profile = await this.getProfile(user, tokens)
            await this.saveProfile(user, profile)

            delete user.spotifyAuthState

            return profile
        } catch (ex) {
            logger.error("Spotify.processAuthCode", user ? logHelper.user(user) : "Unknown user", ex)
            throw ex
        }
    }

    /**
     * Get the OAuth2 access token based on the provided authorization code.
     * This will also trigger an update to the Spotify profile on the database.
     * @param req The request object.
     */
    getToken = async (user: UserData, code: string): Promise<SpotifyTokens> => {
        try {
            const now = dayjs()
            const baseUrl = settings.api.url || `${settings.app.url}api/`
            const qs = {
                grant_type: "authorization_code",
                redirect_uri: `${baseUrl}spotify/auth/callback`,
                code: code
            }

            const postData = new URLSearchParams(qs)
            const basicAuth = Buffer.from(`${settings.spotify.api.clientId}:${settings.spotify.api.clientSecret}`).toString("base64")
            const headers = {Authorization: `Basic ${basicAuth}`, "Content-Type": "application/x-www-form-urlencoded"}
            const reqOptions: SpotifyRequestOptions = {
                method: "POST",
                url: settings.spotify.api.tokenUrl,
                timeout: settings.oauth.tokenTimeout,
                headers: headers,
                data: postData
            }

            // Post auth data to Spotify.
            const res = await this.makeRequest(reqOptions)
            if (!res) {
                throw new Error("Invalid token response")
            }

            // New token details.
            const tokens: SpotifyTokens = {
                accessToken: res.access_token,
                expiresAt: now.add(res.expires_in - 180, "seconds").unix()
            }
            if (res.refresh_token) {
                tokens.refreshToken = res.refresh_token
            }

            logger.info("Spotify.getToken", logHelper.user(user), "Got new tokens")
            return tokens
        } catch (ex) {
            logger.error("Spotify.getToken", user ? logHelper.user(user) : "Unknown user", ex)
            throw ex
        }
    }

    /**
     * Refresh OAuth2 tokens from Spotify.
     * @param user The user.
     * @param refreshToken Optional new refresh token for the user, otherwise use existing one.
     * @event Spotify.tokenFailure
     */
    refreshToken = async (user: UserData, refreshToken?: string): Promise<SpotifyTokens> => {
        try {
            if (!refreshToken && user.spotify?.tokens) {
                refreshToken = user.spotify.tokens.refreshToken
            }
            if (!refreshToken) {
                throw new Error("Missing refresh token")
            }

            const now = dayjs()
            const qs = {
                grant_type: "refresh_token",
                refresh_token: refreshToken
            }

            const postData = new URLSearchParams(qs)
            const basicAuth = Buffer.from(`${settings.spotify.api.clientId}:${settings.spotify.api.clientSecret}`).toString("base64")
            const headers = {Authorization: `Basic ${basicAuth}`, "Content-Type": "application/x-www-form-urlencoded"}
            const reqOptions: SpotifyRequestOptions = {
                method: "POST",
                url: settings.spotify.api.tokenUrl,
                timeout: settings.oauth.tokenTimeout,
                headers: headers,
                data: postData
            }

            // Post auth refresh data to Spotify.
            const res = await this.makeRequest(reqOptions)
            if (!res) {
                throw new Error("Invalid token response")
            }

            // New token details.
            const tokens: SpotifyTokens = {
                accessToken: res.access_token,
                expiresAt: now.add(res.expires_in - 180, "seconds").unix()
            }
            if (res.refresh_token) {
                tokens.refreshToken = res.refresh_token
            }

            logger.info("Spotify.refreshToken", logHelper.user(user), "Refreshed tokens")
            eventManager.emit("Spotify.tokenSuccess", user)

            return tokens
        } catch (ex) {
            const err = logger.error("Spotify.refreshToken", logHelper.user(user), ex)
            this.processAuthError(user, err)
            throw ex
        }
    }

    /**
     * Make sure the user tokens are valid, and if necessary refresh them.
     * @param user The user.
     * @param tokens Optional tokens, if not passed will use the existing ones.
     */
    validateTokens = async (user: UserData, tokens?: SpotifyTokens): Promise<SpotifyTokens> => {
        try {
            if (!tokens) tokens = user.spotify.tokens

            if (tokens.expiresAt <= dayjs().unix()) {
                tokens = await this.refreshToken(user)
                user.spotify.tokens = tokens

                await this.saveProfile(user, user.spotify)
            }
        } catch (ex) {
            logger.error("Spotify.validateTokens", logHelper.user(user), ex)
            throw new Error("Token validation has failed")
        }

        return tokens
    }

    /**
     * Process auth and token errors and emit the appropriate event.
     * @param user The user.
     * @param err The parsed error message.
     */
    processAuthError = async (user: UserData, err: string): Promise<void> => {
        if (err.includes("invalid_grant") || err.includes("expired") || err.includes("client scope")) {
            eventManager.emit("Spotify.tokenFailure", user)
        }
    }

    // METHODS
    // --------------------------------------------------------------------------

    /**
     * Get a Spotify profile for the specified user.
     * @param user User requesting the Spotify profile data.
     * @param tokens Optional tokens, in case the profile is being set for the first time.
     * @event Spotify.tokenFailure
     */
    getProfile = async (user: UserData, tokens?: SpotifyTokens): Promise<SpotifyProfile> => {
        try {
            const cacheId = `profile-${user.id}`
            const cached: SpotifyProfile = cache.get("spotify", cacheId)
            if (cached) {
                logger.info("Spotify.getProfile", logHelper.user(user), `ID ${cached.id}`, "From cache")
                return cached
            }

            if (!tokens) tokens = user.spotify.tokens
            tokens = await this.validateTokens(user, tokens)

            // Make request to fetch profile.
            const res = await this.makeRequest({tokens, path: "me"})
            const profile: SpotifyProfile = {
                id: res.id,
                email: res.email,
                tokens: tokens
            }

            // Save to cache and return the user profile.
            cache.set("spotify", cacheId, profile)
            logger.info("Spotify.getProfile", logHelper.user(user), `ID ${profile.id}`)
            eventManager.emit("Spotify.tokenSuccess", user)

            return profile
        } catch (ex) {
            const err = logger.error("Spotify.getProfile", logHelper.user(user), ex)
            this.processAuthError(user, err)
            throw ex
        }
    }

    /**
     * Get list of played tracks for the specified user activity.
     * Exceptions won't be thrown, will return null instead.
     * @param user The user.
     * @param activity The Strava activity.
     */
    getActivityTracks = async (user: UserData, activity: StravaActivity): Promise<SpotifyTrack[]> => {
        try {
            if (!user.spotify) {
                throw new Error("User has no Spotify account linked")
            }

            const cacheId = `tracks-${activity.id}`
            const cached: SpotifyTrack[] = cache.get("spotify", cacheId)
            if (cached) {
                logger.info("Spotify.getActivityTracks", logHelper.user(user), logHelper.activity(activity), `Got ${cached.length || "no"} tracks`, "From cache")
                return cached
            }

            user.spotify.tokens = await this.validateTokens(user)

            const addedBuffer = settings.spotify.dateBufferSeconds * 1000
            const tsFrom = activity.dateStart.valueOf() - addedBuffer
            const tsTo = activity.dateEnd.valueOf() + addedBuffer
            const tokens = user.spotify.tokens

            // Make request to fetch list of recent tracks, and iterate results
            // to populate the list of matching tracks for the activity timespan.
            // Tracks will be sorted by play date.
            const res = await this.makeRequest({tokens, path: `me/player/recently-played?after=${tsFrom}&limit=${settings.spotify.trackLimit}`})
            const items = _.sortBy(res.items || [], "played_at")

            // Iterate, transform and populate track list.
            const tracks: SpotifyTrack[] = []
            for (let i of items) {
                const track = toSpotifyTrack(i)
                if (track.datePlayed.valueOf() < tsTo) {
                    tracks.push(track)
                }
            }

            // Save to cache and return list of activity tracks.
            cache.set("spotify", cacheId, tracks)
            logger.info("Spotify.getActivityTracks", logHelper.user(user), logHelper.activity(activity), `Got ${tracks.length || "no"} tracks`)
            return tracks
        } catch (ex) {
            const err = logger.error("Spotify.getActivityTracks", logHelper.user(user), logHelper.activity(activity), ex)
            this.processAuthError(user, err)
            return null
        }
    }

    // DATABASE
    // --------------------------------------------------------------------------

    /**
     * Save the Spotify profile to the specified user account.
     * @param user The user.
     * @param profile The Spotify profile with tokens.
     */
    saveProfile = async (user: UserData, profile: SpotifyProfile): Promise<void> => {
        try {
            user.spotify = profile

            const data: Partial<UserData> = {id: user.id, displayName: user.displayName, spotify: profile}

            // Reset auth state.
            if (user.spotifyAuthState) {
                delete user.spotifyAuthState
                data.spotifyAuthState = FieldValue.delete() as any
            }

            await users.update(data)
        } catch (ex) {
            logger.error("Spotify.saveProfile", logHelper.user(user), `ID ${profile.id}`, ex)
        }
    }
}

// Exports...
export default Spotify.Instance
