// Strautomator API: Garmin auth callback

import {garmin} from "strautomator-core"
import {defineEventHandler, sendRedirect} from "nuxt/server"
import {renderError, toCoreRequest} from "../../../utils/web"

/**
 * Validate authentication and try getting an access token from Garmin.
 */
export default defineEventHandler(async (event) => {
    try {
        await garmin.processAuthCallback(toCoreRequest(event) as any)
        return sendRedirect(event, "/account?garmin=linked", 302)
    } catch (ex) {
        return renderError(event, ex)
    }
})
