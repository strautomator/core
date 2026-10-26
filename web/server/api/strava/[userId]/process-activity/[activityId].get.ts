// Strautomator API: Logged user can trigger a forced processing of a particular activity

import {strava} from "strautomator-core"
import {defineEventHandler} from "nuxt/server"
import {requestValidator} from "../../../../utils/auth"
import {renderError, renderJson, getRequiredParam} from "../../../../utils/web"

/**
 * Logged user can trigger a forced processing of a particular activity.
 */
export default defineEventHandler(async (event) => {
    try {
        const user = await requestValidator(event)
        const activityId = getRequiredParam(event, "activityId")

        const processedActivity = await strava.activityProcessing.processActivity(user, {id: parseInt(activityId as string)})
        return renderJson(event, processedActivity || {processed: false})
    } catch (ex) {
        const errorMessage = ex.toString()
        return renderError(event, ex, errorMessage.includes("not found") ? 404 : ex.status || ex.statusCode)
    }
})
