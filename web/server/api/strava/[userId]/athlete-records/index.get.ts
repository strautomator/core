// Strautomator API: Get athlete's personal records

import {strava} from "strautomator-core"
import {defineEventHandler} from "nuxt/server"
import {requestValidator} from "../../../../utils/auth"
import {renderError, renderJson} from "../../../../utils/web"

/**
 * Get athlete's personal records.
 */
export default defineEventHandler(async (event) => {
    try {
        const user = await requestValidator(event)
        const records = await strava.athletes.getAthleteRecords(user)
        return renderJson(event, records)
    } catch (ex) {
        return renderError(event, ex)
    }
})
