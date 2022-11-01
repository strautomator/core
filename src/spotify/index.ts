// Strautomator Core: Spotify

import {SpotifyProfile, SpotifyTokens, SpotifyTrack} from "./types"
import {toSpotifyTrack} from "./utils"
import {StravaActivity} from "../strava/types"
import {UserData} from "../users/types"
import {AxiosConfig, axiosRequest} from "../axios"
import {Request} from "express"
import users from "../users"
import crypto from "crypto"
import cache from "bitecache"
import logger from "anyhow"
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
        } catch (ex) {
            logger.error("Spotify.init", ex)
            throw ex
        }
    }

    /**
     * Make a request to the Spotify API.
     * @param tokens User access tokens.
     * @param path URL path.
     */
    private makeRequest = async (tokens: SpotifyTokens, path: string): Promise<any> => {
        const options: any = {
            method: "GET",
            returnResponse: true,
            url: `${settings.spotify.api.baseUrl}${path}`,
            headers: {
                Authorization: `Bearer ${tokens.accessToken}`,
                "User-Agent": settings.axios.uaBrowser
            }
        }

        try {
            const res = await axiosRequest(options)
            return res ? res.data : null
        } catch (ex) {
            logger.error("Spotify.makeRequest", path, ex)
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
        logger.info("Spotify.generateAuthUrl", `User ${user.id} ${user.displayName}`, `State: ${authState}`)

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
            if (!user || user.spotifyAuthState != arrState[1]) {
                throw new Error("Invalid user")
            }

            const tokens = await this.getToken(user, req.query.code as string)
            const profile = await this.getProfile(user, tokens)
            await this.saveProfile(user, profile)

            delete user.spotifyAuthState

            return profile
        } catch (ex) {
            logger.error("Spotify.processAuthCode", user ? `User ${user.id} ${user.displayName}` : "Unknown user", ex)
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
            const reqOptions: AxiosConfig = {
                method: "POST",
                url: settings.spotify.api.tokenUrl,
                timeout: settings.oauth.tokenTimeout,
                headers: headers,
                data: postData
            }

            // Post auth data to Spotify.
            const res = await axiosRequest(reqOptions)
            if (!res) {
                throw new Error("Invalid token response")
            }

            // New token details.
            const tokens: SpotifyTokens = {
                accessToken: res.access_token,
                expiresAt: now.add(res.expires_in - 120, "seconds").unix()
            }
            if (res.refresh_token) {
                tokens.refreshToken = res.refresh_token
            }

            logger.info("Spotify.getToken", `User ${user.id} ${user.displayName}`, "Got new tokens")
            return tokens
        } catch (ex) {
            logger.error("Spotify.getToken", user ? `User ${user.id} ${user.displayName}` : "Unknown user", ex)
            throw ex
        }
    }

    /**
     * Refresh OAuth2 tokens from Spotify.
     * @param user The user.
     * @param refreshToken Optional new refresh token for the user, otherwise use existing one.
     */
    refreshToken = async (user: UserData, refreshToken?: string): Promise<SpotifyTokens> => {
        try {
            if (!refreshToken) {
                refreshToken = user.spotify.tokens.refreshToken
            }

            const now = dayjs()
            const qs = {
                grant_type: "refresh_token",
                refresh_token: refreshToken
            }

            const postData = new URLSearchParams(qs)
            const basicAuth = Buffer.from(`${settings.spotify.api.clientId}:${settings.spotify.api.clientSecret}`).toString("base64")
            const headers = {Authorization: `Basic ${basicAuth}`, "Content-Type": "application/x-www-form-urlencoded"}
            const reqOptions: AxiosConfig = {
                method: "POST",
                url: settings.spotify.api.tokenUrl,
                timeout: settings.oauth.tokenTimeout,
                headers: headers,
                data: postData
            }

            // Post auth refresh data to Spotify.
            const res = await axiosRequest(reqOptions)
            if (!res) {
                throw new Error("Invalid token response")
            }

            // New token details.
            const tokens: SpotifyTokens = {
                accessToken: res.access_token,
                expiresAt: now.add(res.expires_in - 120, "seconds").unix()
            }
            if (res.refresh_token) {
                tokens.refreshToken = res.refresh_token
            }

            logger.info("Spotify.refreshToken", `User ${user.id} ${user.displayName}`, "Refreshed tokens")
            return tokens
        } catch (ex) {
            logger.error("Spotify.refreshToken", `User ${user.id} ${user.displayName}`, ex)
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
            logger.error("Spotify.validateTokens", `User ${user.id}`, ex)
        }

        return tokens
    }

    // METHODS
    // --------------------------------------------------------------------------

    /**
     * Get a Spotify profile for the specified user.
     * @param user User requesting the Spotify profile data.
     * @param tokens Optional tokens, in case the profile is being set for the first time.
     */
    getProfile = async (user: UserData, tokens?: SpotifyTokens): Promise<SpotifyProfile> => {
        try {
            const cacheId = `profile-${user.id}`
            const cached: SpotifyProfile = cache.get("spotify", cacheId)
            if (cached) {
                logger.info("Spotify.getProfile", `User ${user.id} ${user.displayName}`, `ID ${cached.id}`, "From cache")
                return cached
            }

            if (!tokens) tokens = user.spotify.tokens
            tokens = await this.validateTokens(user, tokens)

            // Make request to fetch profile.
            const res = await this.makeRequest(tokens, "me")
            const profile: SpotifyProfile = {
                id: res.id,
                email: res.email,
                tokens: tokens
            }

            // Save to cache and return the user profile.
            cache.set("spotify", cacheId, profile)
            logger.info("Spotify.getProfile", `User ${user.id} ${user.displayName}`, `ID ${profile.id}`)
            return profile
        } catch (ex) {
            logger.error("Spotify.getProfile", `User ${user.id} ${user.displayName}`, ex)
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
                logger.info("Spotify.getActivityTracks", `User ${user.id} ${user.displayName}`, `Activity ${activity.id}`, `Got ${cached.length || "no"} tracks`, "From cache")
                return cached
            }

            user.spotify.tokens = await this.validateTokens(user)

            const addedBuffer = settings.spotify.dateBufferSeconds * 1000
            const tsFrom = activity.dateStart.valueOf() - addedBuffer
            const tsTo = activity.dateEnd.valueOf() + addedBuffer
            const tokens = user.spotify.tokens

            // Make request to fetch list of recent tracks, and iterate results
            // to populate the list of matching tracks for the activity timespan.
            const res = await this.makeRequest(tokens, `me/player/recently-played?after=${tsFrom}&limit=${settings.spotify.trackLimit}`)
            const tracks: SpotifyTrack[] = []
            for (let i of res.items) {
                const track = toSpotifyTrack(i)
                if (track.datePlayed.valueOf() < tsTo) {
                    tracks.push(track)
                }
            }

            // Save to cache and return list of activity tracks.
            cache.set("spotify", cacheId, tracks)
            logger.info("Spotify.getActivityTracks", `User ${user.id} ${user.displayName}`, `Activity ${activity.id}`, `Got ${tracks.length || "no"} tracks`)
            return tracks
        } catch (ex) {
            logger.error("Spotify.getActivityTracks", `User ${user.id} ${user.displayName}`, `Activity ${activity.id}`, ex)
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
            await users.update({id: user.id, displayName: user.displayName, spotify: profile})
        } catch (ex) {
            logger.error("Spotify.saveProfile", `User ${user.id} ${user.displayName}`, `ID ${profile.id}`, ex)
        }
    }
}

// Exports...
export default Spotify.Instance
