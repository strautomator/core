// Strautomator Core: Strava API

import {StravaTokens} from "./types"
import Bottleneck from "bottleneck"
import eventManager from "../eventmanager"
import logger = require("anyhow")
import moment = require("moment")
import querystring = require("querystring")
const axios = require("axios").default
const settings = require("setmeup").settings
const packageVersion = require("../../package.json").version

/**
 * Strava API handler.
 */
export class StravaAPI {
    private constructor() {}
    private static _instance: StravaAPI
    static get Instance(): StravaAPI {
        return this._instance || (this._instance = new this())
    }

    /**
     * Expose axios to outside modules.
     */
    axios = axios

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
            if (!settings.strava.api.clientId) {
                throw new Error("Missing the strava.api.clientId setting")
            }
            if (!settings.strava.api.clientSecret) {
                throw new Error("Missing the strava.api.clientSecret setting")
            }
            if (!settings.strava.api.verifyToken) {
                throw new Error("Missing the strava.api.verifyToken setting")
            }
            if (!settings.strava.api.urlToken) {
                throw new Error("Missing the strava.api.urlToken setting")
            }

            // Create the bottleneck rate limiter.
            this.limiter = new Bottleneck({
                maxConcurrent: settings.strava.api.maxConcurrent,
                reservoir: settings.strava.api.maxPerMinute,
                reservoirRefreshAmount: settings.strava.api.maxPerMinute,
                reservoirRefreshInterval: 1000 * 60
            })

            // Catch errors.
            this.limiter.on("error", (err) => {
                logger.error("Strava.limiter", err)
            })

            // Rate limiting warnings
            this.limiter.on("depleted", () => {
                logger.warn("Strava.limiter", "Rate limited")
            })

            logger.info("Strava.init", `Max concurrent: ${settings.strava.api.maxConcurrent}, per minute: ${settings.strava.api.maxPerMinute}`)
        } catch (ex) {
            logger.error("Strava.init", ex)
        }
    }

    // TOKENS
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
            const res = await this.axios.post(tokenUrl)

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
            logger.error("Strava.getToken", ex)
        }
    }

    /**
     * Refresh OAuth2 tokens from Strava.
     * @param refreshToken The refresh token for the user / client.
     * @param accessToken Previous access token.
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
            const res = await this.axios.post(tokenUrl)

            if (res == null || res.data == null) {
                throw new Error("Invalid or empty token response")
            }
            // Save new tokens to database.
            const tokens: StravaTokens = {
                accessToken: res.data.access_token,
                refreshToken: res.data.refresh_token,
                expiresAt: res.data.expires_at
            }

            // Publish event.
            eventManager.emit("Strava.refreshToken", refreshToken, tokens)

            return tokens
        } catch (ex) {
            logger.error("Strava.refreshToken", ex)
        }
    }

    /**
     * Revoke the passed access token.
     * @param accessToken Access token to be deauthorized.
     */
    revokeToken = async (accessToken?: string): Promise<void> => {
        try {
            const qs: any = {
                access_token: accessToken
            }

            // Post data to Strava.
            const tokenUrl = `${settings.strava.api.deauthUrl}?${querystring.stringify(qs)}`
            const res = await this.axios.post(tokenUrl)

            if (res == null || res.data == null) {
                throw new Error("Invalid or empty token response")
            }

            const maskedToken = `${accessToken.substring(0, 3)}***${accessToken.substring(accessToken.length - 1)}`
            logger.info("Strava.revokeToken", `Token ${maskedToken} deauthorized`)
        } catch (ex) {
            logger.error("Strava.revokeToken", ex)
        }
    }

    // API REQUEST
    // --------------------------------------------------------------------------

    /**
     * Internal implementation to make a request to the Strava API.
     * @param tokens The user OAuth2 tokens.
     * @param method HTTP method can be GET or POST.
     * @param path The API path.
     * @param params Additional parameters to be passed, optional.
     * @param body Additional body to be posted with the request.
     */
    private makeRequest = async (tokens: StravaTokens, method: string, path: string, params?: any, body?: any) => {
        try {
            let token: string = null

            const options: any = {
                url: `${settings.strava.api.baseUrl}${path}`,
                method: method,
                headers: {"User-Agent": `${settings.app.title} / ${packageVersion}`}
            }

            // Renew token if it has expired.
            if (tokens) {
                if (tokens.expiresAt < moment().unix()) {
                    const newTokens = await this.refreshToken(tokens.refreshToken, tokens.accessToken)
                    token = newTokens.accessToken
                } else {
                    token = tokens.accessToken
                }
            }

            // Token was passed?
            if (token) {
                options.headers["Authorization"] = `Bearer ${token}`
            }

            // Additonal parameters were passed?
            if (params) {
                options.url += `?${querystring.stringify(params)}`
            }

            // Body data was passed?
            if (body) {
                options.data = body
            }

            // Send request to Strava!
            const res: any = await this.limiter.schedule({id: options.path}, () => axios(options))

            if (res == null || res.data == null) {
                throw new Error("Invalid or empty response")
            }

            return res.data
        } catch (ex) {
            logger.debug("Strava.makeRequest", path, method, ex)
            throw ex
        }
    }

    /**
     * Make a GET request to Strava.
     * @param tokens The user OAuth2 token.
     * @param path The API path.
     * @param params Additional parameters to be passed, optional.
     */
    get = async (tokens: StravaTokens, path: string, params?: any) => {
        try {
            return await this.makeRequest(tokens, "GET", path, params)
        } catch (ex) {
            throw ex
        }
    }

    /**
     * Make a PUT request to Strava.
     * @param tokens The user OAuth2 token.
     * @param path The API path.
     * @param params Additional parameters to be passed, optional.
     * @param body Additional body to be posted with the request.
     */
    put = async (tokens: StravaTokens, path: string, params?: any, body?: any) => {
        try {
            return await this.makeRequest(tokens, "PUT", path, params, body)
        } catch (ex) {
            throw ex
        }
    }

    /**
     * Make a POST request to Strava.
     * @param tokens The user OAuth2 tokens.
     * @param path The API path.
     * @param params Additional parameters to be passed, optional.
     * @param body Additional body to be posted with the request.
     */
    post = async (tokens: StravaTokens, path: string, params?: any, body?: any) => {
        try {
            return await this.makeRequest(tokens, "POST", path, params, body)
        } catch (ex) {
            throw ex
        }
    }

    /**
     * Make a DELETE request to Strava.
     * @param tokens The user OAuth2 tokens.
     * @param path The API path.
     * @param params Additional parameters to be passed, optional.
     */
    delete = async (tokens: StravaTokens, path: string, params?: any) => {
        try {
            return await this.makeRequest(tokens, "DELETE", path, params)
        } catch (ex) {
            throw ex
        }
    }
}

// Exports...
export default StravaAPI.Instance
