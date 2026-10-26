// Strautomator API: Get estimated FTP based on activities during the past weeks

import {strava} from "strautomator-core"
import {defineEventHandler} from "nuxt/server"
import {requestValidator} from "../../../../utils/auth"
import {renderError, renderJson} from "../../../../utils/web"

/**
 * Get estimated FTP based on activities during the past weeks.
 */
export default defineEventHandler(async (event) => {
    try {
        const user = await requestValidator(event)
        const data = await strava.performance.estimateFtp(user)
        return renderJson(event, data || false)
    } catch (ex) {
        return renderError(event, ex)
    }
})
