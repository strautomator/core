// Strautomator API: Wahoo auth callback

import {wahoo} from "strautomator-core"
import {defineEventHandler, sendRedirect} from "nuxt/server"
import {renderError, toCoreRequest} from "../../../utils/web"

/**
 * Validate authentication and try getting an access token from Wahoo.
 */
export default defineEventHandler(async (event) => {
    try {
        await wahoo.processAuthCode(toCoreRequest(event) as any)
        return sendRedirect(event, "/account?wahoo=linked", 302)
    } catch (ex) {
        return renderError(event, ex)
    }
})
