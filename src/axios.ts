// Strautomator Core: Token request

import logger = require("anyhow")
import url = require("url")
const axios = require("axios").default
const settings = require("setmeup").settings
const packageVersion = require("../package.json").version

/**
 * Make a request using axios. Will retry once if it times out.
 * @param options Options to be passed to axios.
 */
export const axiosRequest = async (options: any): Promise<any> => {
    try {
        if (!options.headers) options.headers = {}

        // User agent defaults to app title and version.
        options.headers["User-Agent"] = `${settings.app.title} / ${packageVersion}`

        // Make request, return true if response was a 204 with no body, otherwise return response body.
        const res = await axios(options)
        return res.status == 204 && !res.data ? true : res.data
    } catch (ex) {
        const message = `${ex.code} ${ex.message}`.toUpperCase()
        const isTimeout = message.indexOf("ECONNABORTED") >= 0 || message.indexOf("ETIMEDOUT") >= 0 || message.indexOf("TIMEOUT") >= 0
        const isRetryable = ex.response && (ex.response.status == 429 || ex.response.status == 500 || ex.response.status == 502)

        // Retry the request if it failed due to timeout, rate limiting or server errors.
        if (isTimeout || isRetryable) {
            const urlInfo = url.parse(options.url)

            try {
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
