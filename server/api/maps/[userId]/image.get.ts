// Strautomator API: Static map image

import {maps} from "strautomator-core"
import {defineEventHandler, getQuery} from "nuxt/server"
import {requestValidator} from "../../../utils/auth"
import {renderError} from "../../../utils/web"

/**
 * Get static image for specified coordinates.
 */
export default defineEventHandler(async (event) => {
    try {
        await requestValidator(event, {anonymous: true, image: true, referer: true})
        const query = getQuery(event)
        if (!query.latlong) return renderError(event, "Missing latlong", 400)

        const latlong = query.latlong.toString().split(",")
        if (latlong.length != 2 || latlong.some((c) => !isFinite(parseFloat(c)))) return renderError(event, "Invalid latlong", 400)
        const coordinates = {
            latitude: latlong[0] as any,
            longitude: latlong[1] as any
        }

        const style: any = query.style || query.sttyle
        const size: any = query.size
        const zoom: any = query.zoom
        const circle: any = query.circle

        const options: any = {}
        if (style) {
            options.style = style
        }
        if (size) {
            if (isNaN(size)) {
                throw new Error("Parameter size must be a valid number")
            }
            options.size = parseFloat(size)
        }
        if (zoom) {
            if (isNaN(zoom)) {
                throw new Error("Parameter zoom must be a valid number")
            }
            options.zoom = parseFloat(zoom)
        }
        if (circle) {
            if (isNaN(circle)) {
                throw new Error("Parameter circle must be a valid number")
            }
            options.circle = parseFloat(circle)
        }

        const result = await maps.getStaticImage(coordinates, options)
        return new Response(result as any, {headers: {"cache-control": "public, max-age=2592000", "Content-Type": "image/png"}})
    } catch (ex) {
        return renderError(event, ex)
    }
})
