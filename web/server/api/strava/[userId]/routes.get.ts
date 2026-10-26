// Strautomator API: Gets list of routes for the user

import {strava} from "strautomator-core"
import {defineEventHandler} from "nuxt/server"
import {requestValidator} from "../../../utils/auth"
import {renderError, renderJson} from "../../../utils/web"

/**
 * Gets list of routes for the user.
 */
export default defineEventHandler(async (event) => {
    try {
        const user = await requestValidator(event)
        const routes = await strava.routes.getUserRoutes(user)
        return renderJson(event, routes)
    } catch (ex) {
        return renderError(event, ex)
    }
})
