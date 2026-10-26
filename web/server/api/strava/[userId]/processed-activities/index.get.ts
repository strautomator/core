// Strautomator API: Get logged user's activities that were processed by Strautomator

import {defineEventHandler, getQuery} from "nuxt/server"
import {requestValidator} from "../../../../utils/auth"
import {renderError, renderJson} from "../../../../utils/web"
import {getProcessedActivities} from "../../../../utils/logic"

/**
 * Get logged user's activities that were processed by Strautomator.
 */
export default defineEventHandler(async (event) => {
    try {
        const user = await requestValidator(event)
        const activities = await getProcessedActivities(user, getQuery(event))
        return renderJson(event, activities)
    } catch (ex) {
        return renderError(event, ex)
    }
})
