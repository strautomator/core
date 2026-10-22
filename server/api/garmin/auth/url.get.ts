// Strautomator API: Garmin auth URL

import {garmin} from "strautomator-core"
import {defineEventHandler} from "nuxt/server"
import {requestValidator} from "../../../utils/auth"
import {renderError, renderJson} from "../../../utils/web"

/**
 * Initiate an authentication procedure with Garmin.
 */
export default defineEventHandler(async (event) => {
    try {
        const user = await requestValidator(event)
        const authUrl = await garmin.generateAuthUrl(user)
        return renderJson(event, {url: authUrl})
    } catch (ex) {
        return renderError(event, ex)
    }
})
