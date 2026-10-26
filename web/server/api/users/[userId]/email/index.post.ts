// Strautomator API: Set user email address

import {users} from "strautomator-core"
import {defineEventHandler} from "nuxt/server"
import {requestValidator} from "../../../../utils/auth"
import {getBody, renderError, renderJson} from "../../../../utils/web"

/**
 * Set user's email address (pending confirmation).
 */
export default defineEventHandler(async (event) => {
    try {
        const user = await requestValidator(event)
        const body = await getBody(event)
        const email = body?.email ? body.email.trim() : null

        await users.setConfirmEmail(user, email)
        return renderJson(event, {email: email})
    } catch (ex) {
        return renderError(event, ex, 400)
    }
})
