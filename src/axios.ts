// Strautomator Core: Axios

import {AxiosRequestConfig} from "axios"
import jaul = require("jaul")
import logger = require("anyhow")
import url = require("url")
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
 * Make a request using axios. Will retry once if it times out.
 * @param options Options to be passed to axios.
 */
export const axiosRequest = async (options: AxiosConfig): Promise<any> => {
    try {
        if (!options.headers) options.headers = {}

        // User agent defaults to app title and version.
        if (!options.headers["User-Agent"]) {
            options.headers["User-Agent"] = `${settings.app.title} / ${packageVersion}`
        }

        // Make request, return true if response was a 204 with no body, otherwise return response body.
        const res = await axios(options)
        return res.status == 204 && !res.data ? true : options.returnResponse ? res : res.data
    } catch (ex) {
        const message = `${ex.code} ${ex.message}`.toUpperCase()
        const isTimeout = message.includes("ECONNRESET") || message.includes("ECONNABORTED") || message.includes("ETIMEDOUT") || message.includes("TIMEOUT") || message.includes("REQUEST_ABORTED") || message.includes("ERR_BAD_REQUEST")
        const isRetryable = ex.response && [405, 429, 500, 502, 503, 504, 520, 597].includes(ex.response.status)
        const accessDenied = ex.response && [401, 403].includes(ex.response.status)

        // Abort if the stopStatus is set.
        if (options.abortStatus && options.abortStatus.includes(ex.response.status)) {
            return null
        }

        // Retry the request if it failed due to timeout, rate limiting or server errors.
        if ((isTimeout || isRetryable) && !accessDenied) {
            const urlInfo = new url.URL(options.url)

            try {
                await jaul.io.sleep(settings.axios.retryInterval)
                const res = await axios(options)

                logger.warn("Axios.axiosRequest", options.method, `${urlInfo.hostname}${urlInfo.pathname}`, ex, "Failed once, retrying worked")
                return res.status == 204 && !res.data ? true : res.data
            } catch (innerEx) {
                logger.warn("Axios.axiosRequest", options.method, `${urlInfo.hostname}${urlInfo.pathname}`, ex, "Failed twice, will not retry")
                throw innerEx
            }
        }

        throw ex
    }
}
