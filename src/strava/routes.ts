// Strautomator Core: Strava Routes

import {StravaRoute} from "./types"
import {toStravaRoute} from "./utils"
import {UserData} from "../users/types"
import api from "./api"
import logger = require("anyhow")
import * as logHelper from "../loghelper"
import JSZip = require("jszip")
const settings = require("setmeup").settings

/**
 * Strava routes manager.
 */
export class StravaRoutes {
    private constructor() {}
    private static _instance: StravaRoutes
    static get Instance(): StravaRoutes {
        return this._instance || (this._instance = new this())
    }

    // GET ROUTE DATA
    // --------------------------------------------------------------------------

    /**
     * Get detailed route info from Strava.
     * @param user User data.
     * @param idString The route URL ID (for whatever reason, Strava doesn't accept the route ID).
     */
    getRoute = async (user: UserData, idString: string): Promise<StravaRoute> => {
        try {
            const data = await api.get(user.stravaTokens, `routes/${idString}`)
            delete data.segments

            const route = toStravaRoute(user, data)

            logger.info("Strava.getRoute", logHelper.user(user), `Route ${idString}: ${route.name}`)
            return route
        } catch (ex) {
            logger.error("Strava.getRoute", logHelper.user(user), `Route ${idString}`, ex)
            throw ex
        }
    }

    /**
     * Get the GPX representation of the specified route.
     * @param user User data.
     * @param idString The route ID.
     */
    getGPX = async (user: UserData, idString: string): Promise<any> => {
        try {
            const data = await api.get(user.stravaTokens, `routes/${idString}/export_gpx`)

            if (!data) {
                logger.info("Strava.getGPX", logHelper.user(user), `Route ${idString}: no GPX`)
                return null
            }

            logger.info("Strava.getGPX", logHelper.user(user), `Route ${idString}: length ${data.toString().length}`)
            return data
        } catch (ex) {
            logger.error("Strava.getGPX", logHelper.user(user), `Route ${idString}`, ex)
            throw ex
        }
    }

    /**
     * Generate a ZIP file with the specified GPX routes.
     * @param user User data.
     * @param ids The route IDs (idString) as an array.
     */
    zipGPX = async (user: UserData, routeIds: string[]): Promise<NodeJS.ReadableStream> => {
        try {
            if (!routeIds || routeIds.length == 0) {
                routeIds = []
                throw new Error("Missing route IDs")
            }

            if (!user.isPro) {
                throw new Error("GPX downloads are available to PRO users only")
            }

            // Limit amount of routes that can be zipped.
            if (routeIds.length > settings.strava.routes.zipLimit) {
                logger.warn("Strava.zipGPX", logHelper.user(user), `Only first ${settings.strava.routes.zipLimit} of the passed ${routeIds.length} routes will be processed`)
                routeIds = routeIds.slice(0, settings.strava.routes.zipLimit)
            }

            // Add the individual routes to the ZIP file.
            const zip = new JSZip()
            for (let id of routeIds) {
                const route = await this.getRoute(user, id)
                const gpx = await this.getGPX(user, id)
                const filename = route.name.replace(/\s\s+/g, " ").replace(/'/gi, "").replace(/\"/gi, "").replace(/\W/gi, "-").replace(/--+/g, "-")
                await zip.file(`${filename.toLowerCase()}.gpx`, gpx)
            }

            const result = zip.generateNodeStream({type: "nodebuffer", streamFiles: true})
            logger.info("Strava.zipGPX", logHelper.user(user), `Routes: ${routeIds.join(", ")}`)

            return result
        } catch (ex) {
            logger.error("Strava.zipGPX", logHelper.user(user), `Routes: ${routeIds.join(", ")}`, ex)
            throw ex
        }
    }
}

// Exports...
export default StravaRoutes.Instance
