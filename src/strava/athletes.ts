// Strautomator Core: Strava Athletes

import {StravaGear, StravaProfile, StravaTokens} from "./types"
import {toStravaGear, toStravaProfile} from "./types"
import {UserData} from "../users/types"
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
        logger.debug("Strava.getAthlete")

        try {
            const data = await api.get(tokens, "athlete")
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
     * @param user User data.
     * @param id The gear ID string.
     */
    getGear = async (user: UserData, id: string): Promise<StravaGear> => {
        logger.debug("Strava.getGear", id)

        try {
            const data = await api.get(user.stravaTokens, `gear/${id}`)
            const gear = toStravaGear(data, user.profile)

            return gear
        } catch (ex) {
            logger.error("Strava.getGear", id, ex)
            throw ex
        }
    }

    // SET ATHLETE DATA
    // --------------------------------------------------------------------------

    /**
     * Update the user's FTP.
     * @param user User data.
     * @param ftp The FTP (as number).
     */
    setAthleteFTP = async (user: UserData, ftp: number): Promise<void> => {
        logger.debug("Strava.setAthleteFTP", user.id, ftp)

        try {
            if (ftp <= 0) {
                throw new Error("Invalid FTP, must be higher than 0")
            }

            // If FTP hasn't changed, do nothing.
            if (ftp == user.profile.ftp) {
                logger.info("Strava.setAthleteFTP", `User ${user.profile.id} - ${user.profile.username}`, `Unchanged FTP: ${ftp}`)
            } else {
                await api.put(user.stravaTokens, `athlete`, {ftp: ftp})
                logger.info("Strava.setAthleteFTP", `User ${user.profile.id} - ${user.profile.username}`, `FTP ${ftp}`)
            }
        } catch (ex) {
            logger.error("Strava.setAthleteFTP", ex)
        }
    }
}

// Exports...
export default StravaAthletes.Instance
