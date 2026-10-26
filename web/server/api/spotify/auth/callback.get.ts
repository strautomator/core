// Strautomator API: Spotify auth callback

import {spotify} from "strautomator-core"
import {defineEventHandler, sendRedirect} from "nuxt/server"
import {renderError, toCoreRequest} from "../../../utils/web"

/**
 * Validate authentication and try getting an access token from Spotify.
 */
export default defineEventHandler(async (event) => {
    try {
        await spotify.processAuthCode(toCoreRequest(event) as any)
        return sendRedirect(event, "/account?spotify=linked", 302)
    } catch (ex) {
        return renderError(event, ex)
    }
})
