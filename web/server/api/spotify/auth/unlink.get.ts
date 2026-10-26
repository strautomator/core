// Strautomator API: Unlink Spotify

import {users} from "strautomator-core"
import {defineEventHandler} from "nuxt/server"
import {requestValidator} from "../../../utils/auth"
import {renderError, renderJson} from "../../../utils/web"

/**
 * Delete Spotify profile for the user account.
 */
export default defineEventHandler(async (event) => {
    try {
        const user = await requestValidator(event)
        delete user.spotify
        delete user.spotifyAuthState
        await users.update(user, true)

        return renderJson(event, {unlinked: true})
    } catch (ex) {
        return renderError(event, ex)
    }
})
