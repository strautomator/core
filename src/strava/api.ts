// Strautomator Core: Strava API

import {StravaTokens} from "./types"
import {axiosRequest} from "../axios"
import {URLSearchParams} from "url"
import eventManager from "../eventmanager"
import Bottleneck from "bottleneck"
import cache = require("bitecache")
import _ = require("lodash")
import logger = require("anyhow")
import dayjs from "../dayjs"
const settings = require("setmeup").settings

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
            const nodeEnv = process.env.NODE_ENV

            if (nodeEnv != "test") {
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
            }

            // The token can NOT be set in production.
            if (settings.strava.api.token && nodeEnv == "production") {
                throw new Error("The strava.api.token setting cannot be hard coded in production")
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

            // Setup bitecache.
            for (let [key, duration] of Object.entries(settings.strava.cacheDuration)) {
                cache.setup(`strava-${key}`, duration as number)
            }

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

            // Post auth data to Strava.
            const urlParams = new URLSearchParams(qs)
            const reqOptions = {
                method: "POST",
                url: `${settings.strava.api.tokenUrl}?${urlParams.toString()}`,
                timeout: settings.oauth.tokenTimeout
            }

            const res = await axiosRequest(reqOptions)
            if (!res) {
                throw new Error("Invalid token response")
            }

            // Save new tokens to database.
            const tokens: StravaTokens = {
                accessToken: res.access_token,
                refreshToken: res.refresh_token,
                expiresAt: res.expires_at
            }

            if (res.athlete) {
                logger.info("Strava.getToken", `Got token for user ${res.athlete.id}`)
            }

            return tokens
        } catch (ex) {
            this.extractTokenError(ex)

            logger.error("Strava.getToken", ex)
            throw ex
        }
    }

    /**
     * Refresh OAuth2 tokens from Strava.
     * @param refreshToken The refresh token for the user / client.
     * @param accessToken Previous access token.
     * @param noEmit Sometimes we might want to avoid emitting the refreshToken event.
     * @event Strava.refreshToken
     * @event Strava.refreshTokenExpired
     */
    refreshToken = async (refreshToken: string, accessToken?: string, noEmit?: boolean): Promise<StravaTokens> => {
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

            // Post auth data to Strava.
            const urlParams = new URLSearchParams(qs)
            const reqOptions = {
                method: "POST",
                url: `${settings.strava.api.tokenUrl}?${urlParams.toString()}`,
                timeout: settings.oauth.tokenTimeout
            }

            const res = await axiosRequest(reqOptions)
            if (!res) {
                throw new Error("Invalid token response")
            }

            // Save new tokens to database.
            const tokens: StravaTokens = {
                accessToken: res.access_token,
                refreshToken: res.refresh_token,
                expiresAt: res.expires_at
            }

            // Publish event only if noEmit is not set.
            if (!noEmit) {
                eventManager.emit("Strava.refreshToken", refreshToken, tokens)
            }

            return tokens
        } catch (ex) {
            this.extractTokenError(ex)

            if (ex.friendlyMessage && ex.friendlyMessage.indexOf("RefreshToken") >= 0) {
                eventManager.emit("Strava.tokenFailure", refreshToken, true)
            }

            logger.error("Strava.refreshToken", ex)
            throw ex
        }
    }

    /**
     * Revoke the passed access token.
     * @param userId ID of the token's owner.
     * @param accessToken Access token to be deauthorized.
     * @param refreshToken Optional refresh token, in case the access token fails.
     */
    revokeToken = async (userId: string, accessToken: string, refreshToken?: string): Promise<void> => {
        try {
            const qs: any = {
                access_token: accessToken
            }

            // Post auth data to Strava.
            const urlParams = new URLSearchParams(qs)
            const reqOptions = {
                method: "POST",
                url: `${settings.strava.api.deauthUrl}?${urlParams.toString()}`,
                timeout: settings.oauth.tokenTimeout
            }

            // Post data to Strava.
            await axiosRequest(reqOptions)

            logger.info("Strava.revokeToken", `User ${userId}`, `Token deauthorized`)
        } catch (ex) {
            this.extractTokenError(ex)

            if (refreshToken) {
                logger.warn("Strava.revokeToken", `User ${userId}`, ex, "Will retry with refreshed token")

                const tokens = await this.refreshToken(refreshToken, null, true)
                this.revokeToken(userId, tokens.accessToken)
            } else {
                logger.error("Strava.revokeToken", `User ${userId}`, ex)
            }
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
     * @event Strava.refreshTokenExpired
     */
    private makeRequest = async (tokens: StravaTokens, method: string, path: string, params?: any, body?: any): Promise<any> => {
        let token: string = null

        try {
            const options: any = {
                url: `${settings.strava.api.baseUrl}${path}`,
                method: method,
                headers: {}
            }

            // Renew token if it has expired.
            if (tokens) {
                const now = dayjs.utc().unix()

                if (tokens.expiresAt && tokens.expiresAt < now) {
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
                const urlParams = new URLSearchParams(params)
                options.url += `?${urlParams.toString()}`
            }

            // Body data was passed?
            if (body) {
                options.data = body
            }

            // Send request to Strava.
            const res: any = await this.limiter.schedule({id: options.path}, () => axiosRequest(options))

            if (!res) {
                throw new Error("Invalid or empty response")
            }

            return res
        } catch (ex) {
            if (token && ex.response && ex.response.status == 401) {
                eventManager.emit("Strava.tokenFailure", token)
            }

            // Has a error response data? Add it to the exception message.
            if (ex.response && ex.response.data) {
                let details: any

                if (_.isArray(ex.response.data)) {
                    details = ex.response.data.map((a) => Object.values(a).map((v) => JSON.stringify(v, null, 0)))
                } else if (_.isObject(ex.response.data)) {
                    details = Object.values(ex.response.data).map((v) => JSON.stringify(v, null, 0))
                } else {
                    details = [ex.response.data.toString()]
                }

                details = _.flattenDeep(details).join(" - ")

                // Only add extra error details if it wasn't returned as HTML.
                if (!details.includes("<html>")) {
                    ex.message = ex.message ? `${ex.message} - ${details}` : details
                }

                // Make sure a status is set directly on the exception so
                // we can use it elsewhere.
                if (ex.response.status && !ex.status) {
                    ex.status = ex.response.status
                }
            }

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
            const arrPath = path.split("/")

            // The cache key is composed by the first, or first and third parts
            // of the requested path.
            const cacheKey = arrPath.length < 3 ? arrPath[0] : `${arrPath[0]}-${arrPath[2]}`
            const shouldCache = settings.strava.cacheDuration[cacheKey] && tokens && tokens.accessToken
            let cacheId: string
            let fromCache: any

            // Resource might be available on the cache?
            if (shouldCache) {
                let resourceId = arrPath.join("-")
                if (params) resourceId += `-${_.map(_.toPairs(params), (p) => p.join("-"))}`
                cacheId = `${resourceId}-${tokens.accessToken.substring(5, 20)}`

                fromCache = cache.get(`strava-${cacheKey}`, cacheId)

                if (fromCache) {
                    logger.info("Strava.get.fromCache", resourceId)
                    return fromCache
                }
            }

            const result = await this.makeRequest(tokens, "GET", path, params)

            // Respons should be cached?
            if (shouldCache) {
                cache.set(`strava-${cacheKey}`, cacheId, result)
            }

            return result
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

    // HELPERS
    // --------------------------------------------------------------------------

    /**
     * Extract the error details from Strava API responses, and if found,
     * append to the "friendlyMessage" prop on the error itself.
     * @param ex Error or exception object.
     */
    extractTokenError = (ex: any): void => {
        try {
            if (ex.response && ex.response.data && ex.response.data.errors) {
                ex.friendlyMessage = _.map(ex.response.data.errors, (e) => Object.values(e).join(" - ")).join(" | ")
            }
        } catch (ex) {
            logger.warn("Strava.extractTokenError", "Failed to extract error")
        }
    }
}

// Exports...
export default StravaAPI.Instance
