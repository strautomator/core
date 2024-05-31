// Strautomator Core: Garmin API

import {GarminTokens, OAuth1Token} from "./types"
import {AxiosConfig, axiosRequest} from "../axios"
import {AxiosResponse} from "axios"
import oauth1 from "./oauth1"
import Bottleneck from "bottleneck"
import querystring from "querystring"
import logger from "anyhow"
import dayjs from "../dayjs"
const settings = require("setmeup").settings
const packageVersion = require("../../package.json").version

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
            headers: {}
        }

        // Set auth header.
        const oauthData = oauth1.getData(options, tokens.accessToken, tokens.tokenSecret)
        options.headers["Authorization"] = oauth1.getHeader(oauthData)
        options.headers["User-Agent"] = `${settings.app.title} / ${packageVersion}`

        // Return raw data as buffer?
        if (returnBuffer) {
            options.responseType = "arraybuffer"
        }

        // Dispatch request.
        try {
            const jobId = `${options.method}-${targetUrl}-${tokens.accessToken.substring(0, 6)}`
            const res: AxiosResponse = await this.limiter.schedule({id: jobId}, () => axiosRequest(options))
            return res ? res.data : null
        } catch (ex) {
            logger.error("Garmin.makeRequest", targetUrl, ex)
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
    makeTokenRequest = async (path: "access_token" | "request_token", token?: string, secret?: string, verifier?: string): Promise<OAuth1Token> => {
        try {
            const options: AxiosConfig = {
                url: `${settings.garmin.api.authUrl}${path}`,
                method: "POST",
                headers: {}
            }

            // Set oauth data.
            const oauthData = oauth1.getData(options, token, secret, verifier)
            options.data = oauthData
            options.headers.Authorization = oauth1.getHeader(oauthData)

            // Parse response string as a OAuth1Token object.
            const jobId = `${path}-${dayjs().unix()}}`
            const res = await this.limiter.schedule({id: jobId}, () => axiosRequest(options))
            if (res) {
                return querystring.parse(res) as any
            }

            throw new Error(`Invalid token response: ${res}`)
        } catch (ex) {
            logger.error("Garmin.makeTokenRequest", path, ex)
            throw ex
        }
    }
}

// Exports...
export default GarminAPI.Instance
