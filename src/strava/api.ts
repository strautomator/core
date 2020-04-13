// Strautomator Core: Strava API

import Bottleneck from "bottleneck"
import logger = require("anyhow")
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

    /**
     * The authentication URL used to start the OAuth2 flow with Strava.
     */
    get authUrl(): string {
        return `${settings.strava.api.authUrl}?client_id=${settings.strava.api.clientId}&redirect_uri=${settings.app.url}auth/callback&response_type=code&scope=${settings.strava.api.scopes}`
    }

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

            // Create the bottleneck rate limiter.
            this.limiter = new Bottleneck({
                maxConcurrent: settings.strava.api.maxConcurrent,
                reservoir: settings.strava.api.maxPerMinute,
                reservoirRefreshAmount: settings.strava.api.maxPerMinute,
                reservoirRefreshInterval: 1000 * 60
            })

            // Catch errors.
            this.limiter.on("error", (err) => {
                logger.error("StravaAPI.limiter", err)
            })

            // Rate limiting warnings
            this.limiter.on("depleted", () => {
                logger.warn("StravaAPI.limiter", "Rate limited")
            })

            logger.info("Strava.init", `Max concurrent: ${settings.strava.api.maxConcurrent}, per minute: ${settings.strava.api.maxPerMinute}`)
        } catch (ex) {
            logger.error("StravaAPI.init", ex)
            process.exit(37)
        }
    }

    // API REQUEST
    // --------------------------------------------------------------------------

    /**
     * Internal implementation to make a request to the Strava API.
     * @param token The user OAuth2 token.
     * @param method HTTP method can be GET or POST.
     * @param path The API path.
     * @param params Additional parameters to be passed, optional.
     * @param body Additional body to be posted with the request.
     */
    private makeRequest = async (token: string, method: string, path: string, params?: any, body?: any) => {
        try {
            const options: any = {
                url: `${settings.strava.api.baseUrl}${path}`,
                method: method,
                headers: {"User-Agent": `${settings.app.title} ${packageVersion}`}
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
            logger.debug("StravaAPI.makeRequest", path, method, ex)
            throw ex
        }
    }

    /**
     * Make a GET request to Strava.
     * @param token The user OAuth2 token.
     * @param path The API path.
     * @param params Additional parameters to be passed, optional.
     */
    get = async (token: string, path: string, params?: any) => {
        try {
            return await this.makeRequest(token, "GET", path, params)
        } catch (ex) {
            throw ex
        }
    }

    /**
     * Make a PUT request to Strava.
     * @param token The user OAuth2 token.
     * @param path The API path.
     * @param params Additional parameters to be passed, optional.
     * @param body Additional body to be posted with the request.
     */
    put = async (token: string, path: string, params?: any, body?: any) => {
        try {
            return await this.makeRequest(token, "PUT", path, params, body)
        } catch (ex) {
            throw ex
        }
    }

    /**
     * Make a POST request to Strava.
     * @param token The user OAuth2 token.
     * @param path The API path.
     * @param params Additional parameters to be passed, optional.
     * @param body Additional body to be posted with the request.
     */
    post = async (token: string, path: string, params?: any, body?: any) => {
        try {
            return await this.makeRequest(token, "POST", path, params, body)
        } catch (ex) {
            throw ex
        }
    }

    /**
     * Make a DELETE request to Strava.
     * @param token The user OAuth2 token.
     * @param path The API path.
     * @param params Additional parameters to be passed, optional.
     */
    delete = async (token: string, path: string, params?: any) => {
        try {
            return await this.makeRequest(token, "DELETE", path, params)
        } catch (ex) {
            throw ex
        }
    }
}

// Exports...
export default StravaAPI.Instance
