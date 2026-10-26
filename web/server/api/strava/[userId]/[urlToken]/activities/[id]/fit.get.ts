// Strautomator API: Build and download a FIT file for the activity

import {fitparser, strava, users} from "strautomator-core"
import {defineEventHandler, getRouterParam} from "nuxt/server"
import {renderError, getRequiredParam} from "../../../../../../utils/web"
import setmeup from "setmeup"
const settings = setmeup.settings

/**
 * Build and download a FIT file for the activity.
 */
export default defineEventHandler(async (event) => {
    try {
        const userId = getRouterParam(event, "userId", {decode: true})
        const urlToken = getRouterParam(event, "urlToken", {decode: true})
        const user = await users.getById(userId as string)
        if (!user) throw new Error("User not found")
        if (!user.isPro) throw new Error("FIT file downloads are available to PRO users only")
        if (user.urlToken != urlToken) throw new Error(`Download not found`)
        const activityId = getRequiredParam(event, "id", "Missing activity ID")

        const activity = await strava.activities.getActivity(user, activityId.toString())
        const fitfile = await fitparser.buildFitFile(user, activity)

        return new Response(fitfile as any, {
            headers: {
                "Content-Type": "application/octet-stream",
                "Content-Disposition": `attachment; filename="${activityId}.fit"`,
                "Cache-Control": `public, max-age=${settings.strava.cacheDuration["activities-streams"]}`
            }
        })
    } catch (ex) {
        const errorMessage = ex.message || ex.toString().toLowerCase()
        const status = errorMessage.includes("not found") ? 404 : 500
        return renderError(event, errorMessage, status)
    }
})
