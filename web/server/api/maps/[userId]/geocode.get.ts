// Strautomator API: Map geocode

import {maps} from "strautomator-core"
import {defineEventHandler, getQuery, getRequestHeader} from "nuxt/server"
import {requestValidator} from "../../../utils/auth"
import {renderError, renderJson} from "../../../utils/web"

/**
 * Get geocode for the specified address.
 */
export default defineEventHandler(async (event) => {
    try {
        const user = await requestValidator(event)
        const query = getQuery(event)
        const region = getRequestHeader(event, "cf-ipcountry") as string
        const provider = user.isPro || Math.random() > 0.7 ? "google" : "locationiq"
        const results = await maps.getGeocode(query.address as string, region || "", provider)

        return renderJson(event, results)
    } catch (ex) {
        return renderError(event, ex)
    }
})
