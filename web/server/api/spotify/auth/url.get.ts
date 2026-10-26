// Strautomator API: Spotify auth URL

import {spotify} from "strautomator-core"
import {defineEventHandler} from "nuxt/server"
import {requestValidator} from "../../../utils/auth"
import {renderError, renderJson} from "../../../utils/web"

/**
 * Initiate an authentication procedure with Spotify.
 */
export default defineEventHandler(async (event) => {
    try {
        const user = await requestValidator(event)
        const authUrl = await spotify.generateAuthUrl(user)
        return renderJson(event, {url: authUrl})
    } catch (ex) {
        return renderError(event, ex)
    }
})
