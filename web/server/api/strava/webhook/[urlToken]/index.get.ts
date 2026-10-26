// Strautomator API: Activity subscription verification sent by Strava

import {defineEventHandler, getQuery} from "nuxt/server"
import {getClientIP, renderError, renderJson, validateUrlToken} from "../../../../utils/web"
import logger from "anyhow"
import setmeup from "setmeup"
const settings = setmeup.settings

/**
 * Activity subscription verification sent by Strava.
 */
export default defineEventHandler(async (event) => {
    try {
        validateUrlToken(event, settings.strava.api.urlToken)

        const query = getQuery(event)
        const challenge = query["hub.challenge"] as string
        const verifyToken = query["hub.verify_token"] as string
        const clientIP = getClientIP(event)

        if (verifyToken != settings.strava.api.verifyToken) {
            return renderError(event, "Invalid verify_token", 401)
        }

        if (!challenge || challenge == "") {
            return renderError(event, "Missing hub challenge", 401)
        }

        const response = renderJson(event, {"hub.challenge": challenge})
        logger.info("Routes.strava", `Subscription challenge by Strava: ${challenge}`, `IP ${clientIP}`)
        return response
    } catch (ex) {
        return renderError(event, ex, ex.status || 401)
    }
})
