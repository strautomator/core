// Strautomator API: Process queued activities delayed by Strava processing settings

import {strava} from "strautomator-core"
import {defineEventHandler} from "nuxt/server"
import {renderError, renderJson, validateUrlToken} from "../../../../utils/web"
import setmeup from "setmeup"
const settings = setmeup.settings

/**
 * Process queued activities delayed by Strava processing settings.
 */
export default defineEventHandler(async (event) => {
    try {
        validateUrlToken(event, settings.strava.api.urlToken)
        await strava.activityProcessing.processQueuedActivities()
        return renderJson(event, {ok: true})
    } catch (ex) {
        return renderError(event, ex)
    }
})
