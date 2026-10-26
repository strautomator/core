// Strautomator API: Strava status and incident data

import {database} from "strautomator-core"
import {defineEventHandler} from "nuxt/server"
import {renderJson} from "../../utils/web"

/**
 * Strava status and incident data.
 */
export default defineEventHandler(async (event) => {
    try {
        const stravaState = await database.appState.get("strava")
        return renderJson(event, {incident: stravaState?.incident || null})
    } catch (ex) {
        return renderJson(event, {error: ex.message})
    }
})
