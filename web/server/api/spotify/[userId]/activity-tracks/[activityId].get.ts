// Strautomator API: Spotify activity tracks

import {spotify, strava} from "strautomator-core"
import {defineEventHandler, getRouterParam} from "nuxt/server"
import {requestValidator} from "../../../../utils/auth"
import {renderError, renderJson} from "../../../../utils/web"

/**
 * Get list of Spotify tracks that played during the specified activity.
 */
export default defineEventHandler(async (event) => {
    try {
        const user = await requestValidator(event)
        const activity = await strava.activities.getActivity(user, getRouterParam(event, "activityId", {decode: true}) as string)
        const tracks = await spotify.getActivityTracks(user, activity)

        return renderJson(event, tracks)
    } catch (ex) {
        return renderError(event, ex)
    }
})
