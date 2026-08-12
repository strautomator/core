// Strautomator Core: Garmin API

import {GarminTokens, OAuth2Token} from "./types"
import {UserData} from "../users/types"
import {AxiosConfig, axiosRequest} from "../axios"
import {AxiosResponse} from "axios"
import oauth1 from "./oauth1"
import eventManager from "../eventmanager"
import users from "../users"
import Bottleneck from "bottleneck"
import logger from "anyhow"
import dayjs from "../dayjs"
import * as logHelper from "../loghelper"
const settings = require("setmeup").settings

/**
 * Garmin API handler.
 */
export class GarminAPI {
    private constructor() {}
    private static _instance: GarminAPI
    static get Instance(): GarminAPI {
        return this._instance || (this._instance = new this())
    }

    /**
     * API limiter module.
     */
    private limiter: Bottleneck

    // INIT
    // --------------------------------------------------------------------------

    /**
     * Init the Strava API handler.
     */
    init = async (): Promise<void> => {
        try {
            if (!settings.garmin.api.clientId) {
                throw new Error("Missing the garmin.api.clientId setting")
            }
            if (!settings.garmin.api.clientSecret) {
                throw new Error("Missing the garmin.api.clientSecret setting")
            }
            if (!settings.garmin.api.urlToken) {
                throw new Error("Missing the garmin.api.urlToken setting")
            }

            // Create the bottleneck rate limiter.
            this.limiter = new Bottleneck({
                maxConcurrent: settings.garmin.api.maxConcurrent,
                reservoir: settings.garmin.api.maxPerMinute,
                reservoirRefreshAmount: settings.garmin.api.maxPerMinute,
                reservoirRefreshInterval: 1000 * 60
            })

            // Rate limiter events.
            this.limiter.on("error", (err) => logger.error("Garmin.limiter", err))
            this.limiter.on("depleted", () => logger.warn("Garmin.limiter", "Rate limited"))

            logger.info("Garmin.init", `Max concurrent: ${settings.garmin.api.maxConcurrent}, per minute: ${settings.garmin.api.maxPerMinute}`)
        } catch (ex) {
            logger.error("Garmin.init", ex)
        }
    }

    /**
     * Dispatch a request to the Garmin API.
     * @param tokens Access tokens.
     * @param targetUrl API path or full target URL.
     * @param method HTTP method, defaults to GET.
     * @param returnBuffer Set response type to "arraybuffer", default is false.
     */
    makeRequest = async (tokens: GarminTokens, targetUrl: string, method?: string, returnBuffer?: boolean): Promise<any> => {
        if (targetUrl.indexOf("https://") != 0) {
            targetUrl = `${settings.garmin.api.baseUrl}${targetUrl}`
        }
        const options: AxiosConfig = {
            method: method || "GET",
            returnResponse: true,
            url: targetUrl,
            headers: {Authorization: `Bearer ${tokens.accessToken}`}
        }

        // Return raw data as buffer?
        if (returnBuffer) {
            options.responseType = "arraybuffer"
        }

        // Dispatch request.
        try {
            const res: AxiosResponse = await this.limiter.schedule(() => axiosRequest(options))
            return res ? res.data : null
        } catch (ex) {
            logger.error("Garmin.makeRequest", targetUrl, ex)
            throw ex
        }
    }

    // AUTH
    // --------------------------------------------------------------------------

    /**
     * Get the OAuth2 access token based on the provided authorization code.
     * @param user The user authenticating with Garmin.
     * @param code The authorization code provided via the callback URL.
     * @param codeVerifier The PKCE code verifier used to generate the auth URL.
     */
    getToken = async (user: UserData, code: string, codeVerifier: string): Promise<GarminTokens> => {
        try {
            const qs = {
                grant_type: "authorization_code",
                code: code,
                code_verifier: codeVerifier,
                redirect_uri: this.getRedirectUrl()
            }
            const reqOptions: AxiosConfig = {
                method: "POST",
                url: settings.garmin.api.tokenUrl,
                headers: {"Content-Type": "application/x-www-form-urlencoded", Authorization: this.getBasicAuthHeader()},
                data: new URLSearchParams(qs).toString(),
                timeout: settings.oauth.tokenTimeout
            }

            const res: OAuth2Token = await axiosRequest(reqOptions)
            const tokens = this.parseTokenResponse(res)

            logger.info("Garmin.getToken", logHelper.user(user), "Got new tokens")
            return tokens
        } catch (ex) {
            logger.error("Garmin.getToken", user ? logHelper.user(user) : "Unknown user", ex)
            throw ex
        }
    }

    /**
     * Refresh the OAuth2 tokens for the specified user.
     * @param user The user.
     * @param refreshToken Optional refresh token, otherwise use the user's existing one.
     * @event Garmin.tokenSuccess
     */
    refreshToken = async (user: UserData, refreshToken?: string): Promise<GarminTokens> => {
        try {
            if (!refreshToken) {
                refreshToken = user.garmin?.tokens?.refreshToken
            }
            if (!refreshToken) {
                throw new Error("Missing refresh token")
            }

            const qs = {
                grant_type: "refresh_token",
                refresh_token: refreshToken
            }
            const reqOptions: AxiosConfig = {
                method: "POST",
                url: settings.garmin.api.tokenUrl,
                headers: {"Content-Type": "application/x-www-form-urlencoded", Authorization: this.getBasicAuthHeader()},
                data: new URLSearchParams(qs).toString(),
                timeout: settings.oauth.tokenTimeout
            }

            const res: OAuth2Token = await axiosRequest(reqOptions)
            const tokens = this.parseTokenResponse(res)

            logger.info("Garmin.refreshToken", logHelper.user(user), "Refreshed tokens")
            eventManager.emit("Garmin.tokenSuccess", user)

            return tokens
        } catch (ex) {
            logger.error("Garmin.refreshToken", logHelper.user(user), ex)
            throw ex
        }
    }

    /**
     * Exchange the user's legacy OAuth1 tokens for OAuth2 ones. The original OAuth1
     * token remains valid for 30 days after the exchange.
     * @param user The user still using legacy OAuth1 tokens.
     */
    exchangeToken = async (user: UserData): Promise<GarminTokens> => {
        try {
            const tokens = user.garmin?.tokens
            if (!tokens?.tokenSecret) {
                throw new Error("User has no legacy OAuth1 tokens")
            }

            const reqOptions: AxiosConfig = {
                method: "POST",
                url: settings.garmin.api.tokenExchangeUrl,
                headers: {},
                timeout: settings.oauth.tokenTimeout
            }

            // This is the only request that must still be signed with the legacy OAuth1 credentials.
            const oauthData = oauth1.getData(reqOptions, tokens.accessToken, tokens.tokenSecret)
            reqOptions.headers["Authorization"] = oauth1.getHeader(oauthData)

            const res: OAuth2Token = await this.limiter.schedule(() => axiosRequest(reqOptions))
            const newTokens = this.parseTokenResponse(res)

            logger.info("Garmin.exchangeToken", logHelper.user(user), "Exchanged OAuth1 for OAuth2 tokens")
            return newTokens
        } catch (ex) {
            logger.error("Garmin.exchangeToken", logHelper.user(user), ex)
            throw ex
        }
    }

    /**
     * Make sure the user has valid tokens, refreshing them if necessary.
     * @param user The user to be validated.
     */
    validateTokens = async (user: UserData): Promise<GarminTokens> => {
        try {
            const tokens = user.garmin?.tokens
            if (!tokens?.accessToken) {
                throw new Error("User has no Garmin tokens")
            }
            if (tokens.expiresAt > dayjs().unix()) {
                return tokens
            }

            user.garmin.tokens = await this.refreshToken(user)
            await users.update({id: user.id, displayName: user.displayName, garmin: user.garmin})

            return user.garmin.tokens
        } catch (ex) {
            logger.error("Garmin.validateTokens", logHelper.user(user), ex)
            throw new Error("Token validation has failed")
        }
    }

    /**
     * The OAuth2 redirect URL, used on the auth and token requests.
     */
    getRedirectUrl = (): string => {
        const baseUrl = settings.api.url || `${settings.app.url}api/`
        return `${baseUrl}garmin/auth/callback`
    }

    /**
     * Client credentials to be sent as a basic auth header on token requests.
     */
    private getBasicAuthHeader = (): string => {
        const credentials = Buffer.from(`${settings.garmin.api.clientId}:${settings.garmin.api.clientSecret}`).toString("base64")
        return `Basic ${credentials}`
    }

    /**
     * Transform a raw OAuth2 token response into the internal tokens format.
     * @param res The token response from Garmin.
     */
    private parseTokenResponse = (res: OAuth2Token): GarminTokens => {
        if (!res?.access_token) {
            throw new Error("Invalid token response")
        }

        const now = dayjs()
        const tokens: GarminTokens = {
            accessToken: res.access_token,
            refreshToken: res.refresh_token,
            expiresAt: now.add((res.expires_in || 86400) - 600, "seconds").unix()
        }
        if (res.refresh_token_expires_in) {
            tokens.refreshExpiresAt = now.add(res.refresh_token_expires_in, "seconds").unix()
        }

        return tokens
    }
}

// Exports...
export default GarminAPI.Instance
