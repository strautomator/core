// Strautomator API: Match Wahoo activity

import {fitparser, strava} from "strautomator-core"
import {defineEventHandler, getRouterParam} from "nuxt/server"
import {requestValidator} from "../../../../utils/auth"
import {getBody, renderError, renderJson} from "../../../../utils/web"

/**
 * Get the specified Wahoo activity (if there's any).
 */
export default defineEventHandler(async (event) => {
    try {
        const user = await requestValidator(event)
        const body = await getBody(event)
        const stravaId = getRouterParam(event, "stravaId", {decode: true})

        const activity = body?.id && body?.type ? body : await strava.activities.getActivity(user, stravaId.toString())
        if (!activity) {
            throw new Error("Activity not found")
        }

        const wahooActivity = await fitparser.getMatchingActivity(user, activity, "wahoo")
        if (!wahooActivity) {
            return renderJson(event, {notFound: true})
        }

        return renderJson(event, wahooActivity)
    } catch (ex) {
        return renderError(event, ex)
    }
})
