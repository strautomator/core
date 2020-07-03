// Strautomator Core: Token request

import logger = require("anyhow")
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
        const message = ex.toString().toUpperCase()
        const isTimeout = message.indexOf("ECONNABORTED") >= 0 || message.indexOf("ETIMEDOUT") >= 0 || message.indexOf("TIMEOUT") >= 0
        const isRetryable = ex.response && (ex.response.status == 429 || ex.response.status == 500)

        // Retry the request if it failed due to timeout, rate limiting or server errors.
        if (isTimeout || isRetryable) {
            logger.warn("Axios.axiosRequest", options.method, options.url, ex, "Failed, will retry once")

            try {
                const res = await axios(options)
                return res.status == 204 && !res.data ? true : res.data
            } catch (innerEx) {
                throw innerEx
            }
        }

        throw ex
    }
}
