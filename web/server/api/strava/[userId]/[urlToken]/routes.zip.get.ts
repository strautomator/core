// Strautomator API: Returns a ZIP file with the specified routes

import {strava, users} from "strautomator-core"
import {defineEventHandler, getQuery, getRouterParam} from "nuxt/server"
import {renderError} from "../../../../utils/web"
import logger from "anyhow"
import {Readable} from "node:stream"

/**
 * Returns a ZIP file with the specified routes.
 */
export default defineEventHandler(async (event) => {
    try {
        const userId = getRouterParam(event, "userId", {decode: true})
        const urlToken = getRouterParam(event, "urlToken", {decode: true})
        const query = getQuery(event)
        const user = await users.getById(userId as string)

        if (!user) throw new Error(`User ${userId} not found`)
        if (user.urlToken != urlToken) throw new Error(`Download not found`)

        const routes = query.routes as string
        if (!routes) {
            throw new Error("Missing route IDs")
        }
        if (routes.split(",").length > 50) throw Object.assign(new Error("Too many routes"), {status: 400})

        const zip = await strava.routes.zipGPX(user, routes.split(","))
        zip.on("error", (err) => logger.error("Routes.strava", event.req.method, event.url.pathname + event.url.search, err))

        return new Response(Readable.toWeb(zip as any) as any)
    } catch (ex) {
        return renderError(event, ex)
    }
})
