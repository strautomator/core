// Strautomator Web: Session handling for page requests

import {defineEventHandler} from "nuxt/server"
import {checkRequestAuthorization, updateSessionToken} from "../utils/oauth"
import {commitSession} from "../utils/session"
import {getAppInitState} from "../utils/appinit"

/**
 * Paths and static files that are not handled by the session middleware.
 */
const skipPaths = ["/api/", "/auth/", "/mcp", "/.well-known/", "/_", "/images/", "/fonts/"]
const staticAsset = /\.(?:svg|png|jpe?g|gif|webp|ico|css|js|map|woff2?|ttf|txt|xml|webmanifest)$/i

/**
 * On page requests, check the session and refresh the Strava token when necessary,
 * and prepare the initial app state to be passed to the Nuxt app.
 */
export default defineEventHandler(async (event) => {
    const path = event.url.pathname
    if (skipPaths.some((p) => path.startsWith(p)) || staticAsset.test(path)) {
        return
    }

    await checkRequestAuthorization(event)
    await updateSessionToken(event)
    commitSession(event)

    if (event.req.method == "GET") {
        event.context.appInit = await getAppInitState(event)
    }
})
