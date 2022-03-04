// Strautomator Core: Axios

import jaul = require("jaul")
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
        return res.status == 204 && !res.data ? true : options.returnResponse ? res : res.data
    } catch (ex) {
        const message = `${ex.code} ${ex.message}`.toUpperCase()
        const isTimeout = message.includes("ECONNRESET") || message.includes("ECONNABORTED") || message.includes("ETIMEDOUT") || message.includes("TIMEOUT") || message.includes("REQUEST_ABORTED")
        const isRetryable = ex.response && [429, 500, 502, 503, 504, 597].includes(ex.response.status)

        // Retry the request if it failed due to timeout, rate limiting or server errors.
        if (isTimeout || isRetryable) {
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
