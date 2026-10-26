// Strautomator API: Update the user's FTP on Strava

import {defineEventHandler} from "nuxt/server"
import {requestValidator} from "../../../../utils/auth"
import {getBody, renderError, renderJson} from "../../../../utils/web"
import {saveEstimatedFtp} from "../../../../utils/logic"

/**
 * Update the user's FTP on Strava.
 */
export default defineEventHandler(async (event) => {
    try {
        const user = await requestValidator(event)
        const body = await getBody(event)
        const result = await saveEstimatedFtp(user, body?.ftp)
        return renderJson(event, result)
    } catch (ex) {
        return renderError(event, ex)
    }
})
