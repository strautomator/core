// Strautomator Core: Strava Routes

import {StravaRoute} from "./types"
import {toStravaRoute} from "./utils"
import {UserData} from "../users/types"
import api from "./api"
import logger = require("anyhow")

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
            logger.warn("Strava.getRoute", `User ${user.id} ${user.displayName}`, id, ex)
            throw ex
        }
    }
}

// Exports...
export default StravaRoutes.Instance
