// Strautomator Core: Strava Athletes

import {StravaGear, StravaProfile, StravaTokens} from "./types"
import {toStravaGear, toStravaProfile} from "./types"
import api from "./api"
import logger = require("anyhow")

/**
 * Strava webhooks manager.
 */
export class StravaAthletes {
    private constructor() {}
    private static _instance: StravaAthletes
    static get Instance(): StravaAthletes {
        return this._instance || (this._instance = new this())
    }

    // GET ATHLETE DATA
    // --------------------------------------------------------------------------

    /**
     * Get profile info for the logged user.
     * @param tokens Strava access tokens.
     */
    getAthlete = async (tokens: StravaTokens): Promise<StravaProfile> => {
        try {
            const data = await api.get(tokens.accessToken, "athlete")
            const profile = toStravaProfile(data)

            logger.info("Strava.getAthlete", `ID ${profile.id}`, profile.username || profile.firstName || profile.lastName)
            return profile
        } catch (ex) {
            logger.error("Strava.getAthlete", ex)
            throw ex
        }
    }

    /**
     * Get gear details from Strava.
     * @param tokens Strava access tokens.
     * @param id The gear ID string.
     */
    getGear = async (tokens: StravaTokens, id: string): Promise<StravaGear> => {
        logger.debug("Strava.getGear", id)

        try {
            const data = await api.get(tokens.accessToken, `gear/${id}`)
            const gear = toStravaGear(data)

            return gear
        } catch (ex) {
            logger.error("Strava.getGear", id, ex)
            throw ex
        }
    }
}

// Exports...
export default StravaAthletes.Instance
