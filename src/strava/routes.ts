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
     * Get detailed route info from Strava. As routes might be switched to private
     * at any time, this method is not considered fail-safe and will never log
     * exceptions as errors, but as warnings instead.
     * @param user User data.
     * @param id The route ID.
     */
    getRoute = async (user: UserData, id: string): Promise<StravaRoute> => {
        try {
            const data = await api.get(user.stravaTokens, `routes/${id}`)
            delete data.segments

            const route = toStravaRoute(user, data)

            logger.info("Strava.getRoute", `User ${user.id} ${user.displayName}`, `Route ${id}: ${route.name}`)
            return route
        } catch (ex) {
            logger.warn("Strava.getRoute", `User ${user.id} ${user.displayName}`, `Route ${id}`, ex)
            return null
        }
    }

    /**
     * Get the GPX representation of the specified route.
     * @param user User data.
     * @param id The route ID.
     */
    getGPX = async (user: UserData, id: string): Promise<any> => {
        try {
            const data = await api.get(user.stravaTokens, `routes/${id}/export_gpx`)

            if (!data) {
                logger.info("Strava.getGPX", `User ${user.id} ${user.displayName}`, `Route ${id}: no GPX`)
                return null
            }

            logger.info("Strava.getGPX", `User ${user.id} ${user.displayName}`, `Route ${id}: length ${data.toString().length}`)
            return data
        } catch (ex) {
            logger.error("Strava.getGPX", `User ${user.id} ${user.displayName}`, `Route ${id}`, ex)
            throw ex
        }
    }

    /**
     * Generate a ZIP file with the specified GPX routes.
     * @param user User data.
     * @param ids The route IDs as an array.
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
                const gpx = await this.getGPX(user, id)
                zip.file(`${id}.gpx`, gpx)
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
