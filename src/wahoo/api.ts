// Strautomator Core: Wahoo API

import {WahooTokens} from "./types"
import {UserData} from "../users/types"
import {AxiosConfig, axiosRequest} from "../axios"
import {AxiosResponse} from "axios"
import eventManager from "../eventmanager"
import _ from "lodash"
import Bottleneck from "bottleneck"
import logger from "anyhow"
import * as logHelper from "../loghelper"
import dayjs from "../dayjs"
const settings = require("setmeup").settings

/**
 * Wahoo main API wrapper.
 */
export class Wahoo {
    private constructor() {}
    private static _instance: Wahoo
    static get Instance() {
        return this._instance || (this._instance = new this())
    }

    /**
     * API limiter module.
     */
    private limiter: Bottleneck

    // INIT
    // --------------------------------------------------------------------------

    /**
     * Init the Wahoo wrapper.
     */
    init = async (): Promise<void> => {
        try {
            if (!settings.wahoo.api.clientId) {
                throw new Error("Missing the wahoo.api.clientId setting")
            }
            if (!settings.wahoo.api.clientSecret) {
                throw new Error("Missing the wahoo.api.clientSecret setting")
            }
            if (!settings.wahoo.api.urlToken) {
                throw new Error("Missing the wahoo.api.urlToken setting")
            }
            if (!settings.wahoo.api.webhookToken) {
                throw new Error("Missing the wahoo.api.webhookToken setting")
            }

            // Create the bottleneck rate limiter.
            this.limiter = new Bottleneck({
                maxConcurrent: settings.wahoo.api.maxConcurrent,
                reservoir: settings.wahoo.api.maxPerMinute,
                reservoirRefreshAmount: settings.wahoo.api.maxPerMinute,
                reservoirRefreshInterval: 1000 * 60
            })

            // Rate limiter events.
            this.limiter.on("error", (err) => logger.error("Wahoo.limiter", err))
            this.limiter.on("depleted", () => logger.warn("Wahoo.limiter", "Rate limited"))

            logger.info("Wahoo.init", `Cache profile for up to ${settings.wahoo.cacheDuration} seconds`)
        } catch (ex) {
            logger.error("Wahoo.init", ex)
            throw ex
        }
    }

    /**
     * Make a request to the Wahoo API.
     * @param tokens User access tokens.
     * @param targetUrl API path or full target URL.
     * @param returnBuffer Set response type to "arraybuffer", default is false.
     */
    makeRequest = async (tokens: WahooTokens, targetUrl: string, returnBuffer?: boolean): Promise<any> => {
        if (targetUrl.indexOf("https://") != 0) {
            targetUrl = `${settings.wahoo.api.baseUrl}${targetUrl}`
        }
        const options: AxiosConfig = {
            method: "GET",
            returnResponse: true,
            url: targetUrl
        }

        // Token not needed for file downloads.
        if (returnBuffer) {
            options.responseType = "arraybuffer"
        } else {
            options.headers.Authorization = `Bearer ${tokens.accessToken}`
        }

        // Dispatch request.
        try {
            const jobId = `${targetUrl}-${tokens ? tokens.accessToken.substring(0, 6) : "clear"}`
            const res: AxiosResponse = await this.limiter.schedule({id: jobId}, () => axiosRequest(options))
            return res ? res.data : null
        } catch (ex) {
            logger.error("Wahoo.makeRequest", targetUrl, ex)
            throw ex
        }
    }

    // AUTH
    // --------------------------------------------------------------------------

    /**
     * Get the OAuth2 access token based on the provided authorization code.
     * This will also trigger an update to the Wahoo profile on the database.
     * @param req The request object.
     */
    getToken = async (user: UserData, code: string): Promise<WahooTokens> => {
        try {
            const now = dayjs()
            const baseUrl = settings.api.url || `${settings.app.url}api/`
            const redirectUrl = `${baseUrl}wahoo/auth/callback`
            const tokenUrl = `${settings.wahoo.api.baseUrl}oauth/token?client_id=${settings.wahoo.api.clientId}&client_secret=${settings.wahoo.api.clientSecret}&redirect_uri=${redirectUrl}&code=${code}&grant_type=authorization_code`
            const headers = {"Content-Type": "application/json"}
            const reqOptions: AxiosConfig = {
                method: "POST",
                url: tokenUrl,
                timeout: settings.oauth.tokenTimeout,
                headers: headers
            }

            // Post auth data to Wahoo.
            const res = await axiosRequest(reqOptions)
            if (!res) {
                throw new Error("Invalid token response")
            }

            // New token details.
            const tokens: WahooTokens = {
                accessToken: res.access_token,
                expiresAt: now.add(res.expires_in - 180, "seconds").unix()
            }
            if (res.refresh_token) {
                tokens.refreshToken = res.refresh_token
            }

            logger.info("Wahoo.getToken", logHelper.user(user), "Got new tokens")
            return tokens
        } catch (ex) {
            logger.error("Wahoo.getToken", user ? logHelper.user(user) : "Unknown user", ex)
            throw ex
        }
    }

    /**
     * Refresh OAuth2 tokens from Wahoo.
     * @param user The user.
     * @param refreshToken Optional new refresh token for the user, otherwise use existing one.
     */
    refreshToken = async (user: UserData, refreshToken?: string): Promise<WahooTokens> => {
        try {
            if (!refreshToken && user.wahoo?.tokens) {
                refreshToken = user.wahoo.tokens.refreshToken
            }
            if (!refreshToken) {
                throw new Error("Missing refresh token")
            }

            const now = dayjs()
            const tokenUrl = `${settings.wahoo.api.baseUrl}oauth/token?client_id=${settings.wahoo.api.clientId}&client_secret=${settings.wahoo.api.clientSecret}&grant_type=refresh_token&refresh_token=${refreshToken}`
            const headers = {"Content-Type": "application/json"}
            const reqOptions: AxiosConfig = {
                method: "POST",
                url: tokenUrl,
                timeout: settings.oauth.tokenTimeout,
                headers: headers
            }

            // Post auth data to Wahoo.
            const res = await axiosRequest(reqOptions)
            if (!res) {
                throw new Error("Invalid token response")
            }

            // New token details.
            const tokens: WahooTokens = {
                accessToken: res.access_token,
                expiresAt: now.add(res.expires_in - 180, "seconds").unix()
            }
            if (res.refresh_token) {
                tokens.refreshToken = res.refresh_token
            }

            logger.info("Wahoo.refreshToken", logHelper.user(user), "Refreshed tokens")
            return tokens
        } catch (ex) {
            const err = logger.error("Wahoo.refreshToken", logHelper.user(user), ex)
            this.processAuthError(user, err)
            throw ex
        }
    }

    /**
     * Deauthorize the user from Wahoo.
     * @param user The user.
     */
    revokeToken = async (user: UserData): Promise<void> => {
        try {
            if (!user.wahoo?.tokens?.accessToken) {
                logger.warn("Wahoo.revokeToken", logHelper.user(user), "User has no access token, can't revoke token")
                return
            }

            const tokenUrl = `${settings.wahoo.api.baseUrl}v1/permissions`
            const headers = {"Content-Type": "application/json", Authorization: `Bearer ${user.wahoo.tokens.accessToken}`}
            const reqOptions: AxiosConfig = {
                method: "DELETE",
                url: tokenUrl,
                timeout: settings.oauth.tokenTimeout,
                headers: headers
            }

            // Revoke token on Wahoo.
            await axiosRequest(reqOptions)
            logger.info("Wahoo.revokeToken", logHelper.user(user), "Deauthorized")
        } catch (ex) {
            logger.error("Wahoo.revokeToken", logHelper.user(user), ex)
        }
    }

    /**
     * Make sure the user tokens are valid, and if necessary refresh them.
     * @param user The user.
     * @param tokens Optional tokens, if not passed will use the existing ones.
     */
    validateTokens = async (user: UserData, tokens?: WahooTokens): Promise<WahooTokens> => {
        try {
            if (!tokens) tokens = user.wahoo.tokens

            if (tokens.expiresAt <= dayjs().unix()) {
                tokens = await this.refreshToken(user)
                user.wahoo.tokens = tokens
            }
        } catch (ex) {
            logger.error("Wahoo.validateTokens", logHelper.user(user), ex)
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
            eventManager.emit("Wahoo.tokenFailure", user)
        }
    }
}

// Exports...
export default Wahoo.Instance
