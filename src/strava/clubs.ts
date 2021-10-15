// Strautomator Core: Strava Clubs

import {StravaClub, StravaClubEvent} from "./types"
import {toStravaClub, toStravaClubEvent} from "./utils"
import {UserData} from "../users/types"
import api from "./api"
import logger = require("anyhow")

/**
 * Strava clubs manager.
 */
export class StravaClubs {
    private constructor() {}
    private static _instance: StravaClubs
    static get Instance(): StravaClubs {
        return this._instance || (this._instance = new this())
    }

    // GET CLUB DATA
    // --------------------------------------------------------------------------

    /**
     * Get athlete clubs from Strava.
     * @param user User data.
     */
    getClubs = async (user: UserData): Promise<StravaClub[]> => {
        logger.debug("Strava.getClubs")

        try {
            const data: any[] = await api.get(user.stravaTokens, "athlete/clubs")
            const clubs: StravaClub[] = data.map((d) => toStravaClub(d))

            logger.info("Strava.getClubs", `User ${user.id} ${user.displayName}`, `Got ${clubs.length} clubs`)
            return clubs
        } catch (ex) {
            logger.error("Strava.getClubs", `User ${user.id} ${user.displayName}`, ex)
            throw ex
        }
    }

    /**
     * Get detailed club info from Strava.
     * @param user User data.
     * @param id The club ID.
     */
    getClub = async (user: UserData, id: string): Promise<StravaClub> => {
        logger.debug("Strava.getClub", id)

        try {
            const data = await api.get(user.stravaTokens, `clubs/${id}/group_events`)
            const club = toStravaClub(data)

            logger.info("Strava.getClub", `User ${user.id} ${user.displayName}`, `Club ${id}: ${club.name} @ ${club.country}`)
            return club
        } catch (ex) {
            logger.error("Strava.getClub", `User ${user.id} ${user.displayName}`, id, ex)
            throw ex
        }
    }

    /**
     * Get list of events for the specified club.
     * @param user User data.
     * @param id The club ID.
     */
    getClubEvents = async (user: UserData, id: string): Promise<StravaClubEvent[]> => {
        logger.debug("Strava.getClubEvents", id)

        try {
            const data = await api.get(user.stravaTokens, `clubs/${id}/group_events`)
            const clubEvents: StravaClubEvent[] = data.map((d) => toStravaClubEvent(d))

            logger.info("Strava.getClubEvents", `User ${user.id} ${user.displayName}`, `Club ${id} has ${clubEvents.length} events`)
            return clubEvents
        } catch (ex) {
            logger.error("Strava.getClubEvents", `User ${user.id} ${user.displayName}`, id, ex)
            throw ex
        }
    }
}

// Exports...
export default StravaClubs.Instance
