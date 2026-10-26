// Strautomator API: Get the details for the specified activity

import {strava} from "strautomator-core"
import {defineEventHandler} from "nuxt/server"
import {requestValidator} from "../../../../../utils/auth"
import {renderError, renderJson, getRequiredParam} from "../../../../../utils/web"

/**
 * Get the details for the specified activity.
 */
export default defineEventHandler(async (event) => {
    try {
        const user = await requestValidator(event)
        const activityId = getRequiredParam(event, "id", "Missing activity ID")

        const activity = await strava.activities.getActivity(user, activityId.toString())
        return renderJson(event, activity)
    } catch (ex) {
        const errorMessage = (ex.message || ex.toString()).toLowerCase()
        const status = errorMessage.includes("not found") ? 404 : ex.status || ex.statusCode
        return renderError(event, ex, status)
    }
})
