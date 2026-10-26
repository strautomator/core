// Strautomator API: Map reverse geocode

import {maps} from "strautomator-core"
import {defineEventHandler, getQuery} from "nuxt/server"
import {requestValidator} from "../../../utils/auth"
import {renderError, renderJson} from "../../../utils/web"

/**
 * Get reverse geocode for the specified coordinates.
 */
export default defineEventHandler(async (event) => {
    try {
        const user = await requestValidator(event)
        const queryObject = getQuery(event)
        if (!queryObject.c) throw new Error("Missing query coordinates")

        const query = queryObject.c.toString()
        const coordinates = query.split(",").map((c) => parseFloat(c))
        const provider = user.isPro || Math.random() > 0.7 ? "google" : "locationiq"
        const result = await maps.getReverseGeocode(coordinates as [number, number], provider)

        return renderJson(event, result)
    } catch (ex) {
        return renderError(event, ex)
    }
})
