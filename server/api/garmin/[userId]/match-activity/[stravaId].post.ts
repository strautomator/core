// Strautomator API: Match Garmin activity

import {fitparser, strava} from "strautomator-core"
import {defineEventHandler, getRouterParam} from "nuxt/server"
import {requestValidator} from "../../../../utils/auth"
import {getBody, renderError, renderJson} from "../../../../utils/web"

/**
 * Get the specified Garmin activity (if there's any).
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

        const garminActivity = await fitparser.getMatchingActivity(user, activity, "garmin")
        if (!garminActivity) {
            return renderJson(event, {notFound: true})
        }

        return renderJson(event, garminActivity)
    } catch (ex) {
        return renderError(event, ex)
    }
})
