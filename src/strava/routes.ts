// Strautomator Core: Strava Routes

import {StravaRoute} from "./types"
import {toStravaRoute} from "./utils"
import {UserData} from "../users/types"
import api from "./api"
import logger = require("anyhow")
import JSZip = require("jszip")

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

            logger.info("Strava.getRoute", `User ${user.id} ${user.displayName}`, `Route ${idString}: ${route.name}`)
            return route
        } catch (ex) {
            logger.error("Strava.getRoute", `User ${user.id} ${user.displayName}`, `Route ${idString}`, ex)
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
                logger.info("Strava.getGPX", `User ${user.id} ${user.displayName}`, `Route ${idString}: no GPX`)
                return null
            }

            logger.info("Strava.getGPX", `User ${user.id} ${user.displayName}`, `Route ${idString}: length ${data.toString().length}`)
            return data
        } catch (ex) {
            logger.error("Strava.getGPX", `User ${user.id} ${user.displayName}`, `Route ${idString}`, ex)
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

            // Add the individual routes to the ZIP file.
            const zip = new JSZip()
            for (let id of routeIds) {
                const route = await this.getRoute(user, id)
                const gpx = await this.getGPX(user, id)
                const filename = route.name.replace(/\s\s+/g, " ").replace(/'/gi, "").replace(/\"/gi, "").replace(/\W/gi, "-").replace(/--+/g, "-")
                await zip.file(`${filename.toLowerCase()}.gpx`, gpx)
            }

            const result = zip.generateNodeStream({type: "nodebuffer", streamFiles: true})
            logger.info("Strava.zipGPX", `User ${user.id} ${user.displayName}`, `Routes: ${routeIds.join(", ")}`)

            return result
        } catch (ex) {
            logger.error("Strava.zipGPX", `User ${user.id} ${user.displayName}`, `Routes: ${routeIds.join(", ")}`, ex)
            throw ex
        }
    }
}

// Exports...
export default StravaRoutes.Instance
