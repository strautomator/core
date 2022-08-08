// Strautomator Core: Strava Clubs

import {StravaClub, StravaClubEvent} from "./types"
import {toStravaClub, toStravaClubEvent} from "./utils"
import {UserData} from "../users/types"
import stravaRoutes from "./routes"
import api from "./api"
import dayjs from "../dayjs"
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
        try {
            const data = await api.get(user.stravaTokens, `clubs/${id}/group_events`)
            if (!data) return []

            const clubEvents: StravaClubEvent[] = data.map((d) => toStravaClubEvent(d))

            logger.info("Strava.getClubEvents", `User ${user.id} ${user.displayName}`, `Club ${id} has ${clubEvents.length} events`)
            return clubEvents
        } catch (ex) {
            logger.error("Strava.getClubEvents", `User ${user.id} ${user.displayName}`, id, ex)
            throw ex
        }
    }

    // HELPER METHODS
    // --------------------------------------------------------------------------

    /**
     * Get upcoming club events for the specified user.
     * @param user User data.
     * @param days Return events for that many days ahead, where 0 = only today.
     */
    getUpcomingClubEvents = async (user: UserData, days: number): Promise<StravaClubEvent[]> => {
        try {
            const today = dayjs()
            const maxDate = dayjs().add(days, "days").endOf("day")
            const result: StravaClubEvent[] = []

            // Iterate clubs to get the upcoming events.
            const clubs = await this.getClubs(user)
            for (let club of clubs) {
                const events = await this.getClubEvents(user, club.id)

                for (let event of events) {
                    event.dates = event.dates.filter((eDate) => today.isBefore(eDate) && maxDate.isAfter(eDate))

                    if (event.dates.length > 0) {
                        result.push(event)

                        // We need the full route details, including distance and polyline.
                        if (event.route && event.route.id && (!event.route.distance || !event.route.polyline)) {
                            event.route = await stravaRoutes.getRoute(user, event.route.id)
                        }
                    }
                }
            }

            logger.info("Strava.getUpcomingClubEvents", `User ${user.id} ${user.displayName}`, `Next ${days} days`, `${result.length || "No"} upcoming events`)
            return result
        } catch (ex) {
            logger.error("Strava.getUpcomingClubEvents", `User ${user.id} ${user.displayName}`, `Next ${days} days`, ex)
            throw ex
        }
    }
}

// Exports...
export default StravaClubs.Instance
