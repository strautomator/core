// Strautomator API: Get a single processed activity for the logged user

import {strava} from "strautomator-core"
import {defineEventHandler} from "nuxt/server"
import {requestValidator} from "../../../../utils/auth"
import {renderError, renderJson, getRequiredParam} from "../../../../utils/web"

/**
 * Get a single processed activity for the logged user.
 */
export default defineEventHandler(async (event) => {
    try {
        const user = await requestValidator(event)
        const activity = await strava.activityProcessing.getProcessedActivity(user, parseInt(getRequiredParam(event, "id") as string))
        return renderJson(event, activity)
    } catch (ex) {
        return renderError(event, ex, 404)
    }
})
