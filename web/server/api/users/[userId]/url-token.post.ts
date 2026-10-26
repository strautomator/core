// Strautomator API: Reset user URL token

import {users} from "strautomator-core"
import {defineEventHandler} from "nuxt/server"
import {requestValidator} from "../../../utils/auth"
import {getBody, renderError, renderJson} from "../../../utils/web"

/**
 * Reset the user's URL token.
 */
export default defineEventHandler(async (event) => {
    try {
        const body = await getBody(event)
        if (!body) throw new Error("Missing request params")

        const user = await requestValidator(event)

        const oldToken = body.urlToken
        if (oldToken != user.urlToken) {
            throw new Error(`The passed URL token does not match the existing one`)
        }

        const newToken = await users.setUrlToken(user)
        return renderJson(event, {urlToken: newToken})
    } catch (ex) {
        return renderError(event, ex, 400)
    }
})
