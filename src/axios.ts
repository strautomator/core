// Strautomator Core: Axios

import {AxiosRequestConfig, AxiosResponse} from "axios"
import jaul from "jaul"
import logger from "anyhow"
import url from "url"
const axios = require("axios").default
const settings = require("setmeup").settings
const packageVersion = require("../package.json").version

/**
 * Custom axios configuration.
 */
export interface AxiosConfig extends AxiosRequestConfig {
    /** Set to true to return the full response object. */
    returnResponse?: boolean
    /** Abort request if the response has any of these status codes. */
    abortStatus?: number[]
    /** Path part of the URL. */
    path?: string
}

/**
 * A rudimentary rate-limit logging and throttling mechanism that activates
 * when we are about to reach the API's predefined rate limits.
 * @param res The response from the target API.
 * @param urlInfo URL information.
 * @param rateLimitExtractor Optional function to extract the rate limits from the response.
 */
export const rateLimitDelay = async (res: AxiosResponse, urlInfo: URL, rateLimitExtractor?: (res: AxiosResponse) => number) => {
    const logUrl = `${urlInfo.hostname}${urlInfo.pathname}`

    if (res.headers && rateLimitExtractor) {
        try {
            const usedQuota = rateLimitExtractor(res)
            const modQuota = usedQuota % 2

            if (usedQuota > settings.axios.backoffThreshold / 2 && modQuota == 0) {
                logger.warn("Axios.rateLimitDelay", logUrl, `Used ${usedQuota.toFixed(1)}% of API quota`)
            }
            if (usedQuota >= settings.axios.backoffThreshold) {
                const multiplier = (usedQuota - settings.axios.backoffThreshold) * 1.5
                const delay = Math.round(settings.axios.backoffInterval * multiplier)
                await jaul.io.sleep(delay)

                if (modQuota == 1) {
                    logger.warn("Axios.rateLimitDelay", logUrl, `Used ${usedQuota.toFixed(1)}% of API quota`, `Delayed ${delay}ms`)
                }
            }
        } catch (headerEx) {
            logger.warn("Axios.rateLimitDelay", logUrl, "Failed to extract the rate limits", headerEx)
        }
    }
    if (res.status == 429) {
        logger.warn("Axios.rateLimitDelay", logUrl, "Rate limited")
        await jaul.io.sleep(settings.axios.retryInterval)
    }
}

/**
 * Make a request using axios. Will retry once if it times out.
 * @param options Options to be passed to axios.
 * @param rateLimitExtractor Optional function to extract the rate limit usage (0 to 100%) from the response.
 */
export const axiosRequest = async (options: AxiosConfig, rateLimitExtractor?: (res: AxiosResponse) => number): Promise<AxiosResponse | any> => {
    const urlInfo = new url.URL(options.url)
    const logUrl = `${urlInfo.hostname}${urlInfo.pathname}`

    try {
        if (!options.method) options.method = "GET"
        if (!options.timeout) options.timeout = settings.axios.timeout
        if (!options.headers) options.headers = {}

        // User agent defaults to app title and version.
        if (!options.headers["User-Agent"]) {
            options.headers["User-Agent"] = `${settings.app.title} / ${packageVersion}`
        }

        // Make request and check for possible rate limits.
        const res: AxiosResponse = await axios(options)
        if (!res) {
            logger.warn("Axios.axiosRequest", options.method, logUrl, "Empty response object")
            return null
        }

        // Check limits and return true if response was a 204 with no body, otherwise return response body.
        await rateLimitDelay(res, urlInfo, rateLimitExtractor)
        return res.status == 204 && !res.data ? true : options.returnResponse ? res : res.data
    } catch (ex) {
        const statusCode = ex.response?.status || 500
        if (!ex.statusCode) {
            ex.statusCode = statusCode
        }

        const message = `${ex.code} ${ex.message}`.toUpperCase()
        const isTimeout = message.includes("ECONNRESET") || message.includes("ECONNABORTED") || message.includes("ETIMEDOUT") || message.includes("TIMEOUT") || message.includes("REQUEST_ABORTED") || message.includes("ERR_BAD_REQUEST")
        const isRetryable = ex.response && [405, 429, 500, 502, 503, 504, 520, 597].includes(statusCode)
        const accessDenied = ex.response && [401, 403].includes(statusCode)

        // Abort if the stopStatus is set.
        if (options.abortStatus?.includes(statusCode)) {
            logger.warn("Axios.axiosRequest", options.method, logUrl, `Aborted with status ${statusCode}`)
            return null
        }

        // Retry the request if it failed due to timeout, rate limiting or server errors.
        if ((isTimeout || isRetryable) && !accessDenied) {
            try {
                await jaul.io.sleep(settings.axios.retryInterval)

                // Retry the request.
                const res = await axios(options)
                if (!res) {
                    logger.warn("Axios.axiosRequest", options.method, logUrl, ex, "Failed once, then got an empty response")
                } else {
                    logger.warn("Axios.axiosRequest", options.method, logUrl, ex, "Failed once, retrying worked")
                }

                // Check limits and return true if response was a 204 with no body, otherwise return response body.
                await rateLimitDelay(res, urlInfo, rateLimitExtractor)
                return res.status == 204 && !res.data ? true : options.returnResponse ? res : res.data
            } catch (innerEx) {
                logger.warn("Axios.axiosRequest", options.method, logUrl, ex, "Failed twice, will not retry")
                throw innerEx
            }
        }

        throw ex
    }
}
