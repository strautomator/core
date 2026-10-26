// Strautomator API: Link Last.fm

import {lastfm} from "strautomator-core"
import {defineEventHandler} from "nuxt/server"
import {requestValidator} from "../../../utils/auth"
import {getBody, renderError, renderJson} from "../../../utils/web"

/**
 * Link the Last.fm profile by username for the user account.
 */
export default defineEventHandler(async (event) => {
    try {
        const user = await requestValidator(event)
        const body = await getBody(event)
        const rawUsername: string = body?.username
        if (!rawUsername || typeof rawUsername != "string") {
            throw new Error("Missing Last.fm username")
        }

        const username = rawUsername.toString().trim().toLowerCase().substring(0, 64)
        if (username.length < 2) {
            throw new Error("Invalid Last.fm username")
        }

        const profile = await lastfm.getProfile(user, username)
        await lastfm.saveProfile(user, profile)

        return renderJson(event, profile)
    } catch (ex) {
        if (ex.response?.status == 404) {
            return renderError(event, "User not found", 404)
        }
        return renderError(event, ex, ex?.status || ex?.statusCode || 400)
    }
})
