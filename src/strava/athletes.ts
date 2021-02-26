// Strautomator Core: Strava Athletes

import {StravaGear, StravaProfile, StravaTokens} from "./types"
import {toStravaGear, toStravaProfile} from "./types"
import {UserData} from "../users/types"
import users from "../users"
import api from "./api"
import logger = require("anyhow")
import moment = require("moment")
const settings = require("setmeup").settings

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
     * @param force Force update, even if FTP was updated recently or is still the same value.
     */
    setAthleteFtp = async (user: UserData, ftp: number, force?: boolean): Promise<boolean> => {
        logger.debug("Strava.setAthleteFtp", user.id, ftp)

        try {
            if (ftp <= 0) {
                throw new Error("Invalid FTP, must be higher than 0")
            }

            // Updating the FTP via Strautomator is limited to once every 24 hours by default,
            // and only if the value actually changed. Ignore these conditions if force is set.
            if (!force) {
                if (user.dateLastFtpUpdate) {
                    const now = moment().subtract(settings.strava.ftp.sinceLastHours, "hours").unix()
                    const lastUpdate = moment(user.dateLastFtpUpdate).unix()

                    if (lastUpdate >= now) {
                        logger.warn("Strava.setAthleteFtp", `User ${user.id} - ${user.displayName}`, `FTP ${ftp}`, `Abort, FTP was already updated recently`)
                        return false
                    }
                }

                if (ftp == user.profile.ftp) {
                    logger.warn("Strava.setAthleteFtp", `User ${user.id} - ${user.displayName}`, `Unchanged FTP ${ftp}`)
                    return false
                }
            }

            // All good? Update FTP on Strava and save date to the database.
            await api.put(user.stravaTokens, `athlete`, {ftp: ftp})
            await users.update({id: user.id, displayName: user.displayName, dateLastFtpUpdate: new Date()})
            logger.info("Strava.setAthleteFtp", `User ${user.id} - ${user.displayName}`, `FTP ${ftp}`)

            return true
        } catch (ex) {
            logger.error("Strava.setAthleteFtp", ex)
        }
    }
}

// Exports...
export default StravaAthletes.Instance
