// Strautomator Core: Strava Clubs

import {StravaClub, StravaClubEvent} from "./types"
import {toStravaClub, toStravaClubEvent} from "./utils"
import {UserData} from "../users/types"
import stravaRoutes from "./routes"
import api from "./api"
import dayjs from "../dayjs"
import _ = require("lodash")
import logger = require("anyhow")
const settings = require("setmeup").settings

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

            // Helper function to get club events.
            const getEvents = async (club: StravaClub) => {
                const events = await this.getClubEvents(user, club.id)

                for (let event of events) {
                    event.dates = event.dates.filter((eDate) => today.isBefore(eDate) && maxDate.isAfter(eDate))

                    if (event.dates.length > 0) {
                        result.push(event)

                        // Sort event dates, as Strava sometimes return messed up dates.
                        event.dates.sort()

                        // We need the full route details, including distance and polyline.
                        if (event.route && event.route.id && (!event.route.distance || !event.route.polyline)) {
                            try {
                                event.route = await stravaRoutes.getRoute(user, event.route.urlId)
                            } catch (routeEx) {
                                logger.warn("Strava.getUpcomingClubEvents", `User ${user.id} ${user.displayName}`, `Event ${event.title}`, "Failed to get route details")
                            }
                        }
                    }
                }
            }

            // Iterate clubs to get the upcoming events.
            const clubs = await this.getClubs(user)
            const batchSize = user.isPro ? settings.plans.pro.apiConcurrency : settings.plans.free.apiConcurrency
            while (clubs.length) {
                await Promise.all(clubs.splice(0, batchSize).map(getEvents))
            }

            logger.info("Strava.getUpcomingClubEvents", `User ${user.id} ${user.displayName}`, `Next ${days} days`, `${result.length || "No"} upcoming events`)
            return _.sortBy(result, (r) => r.dates[0])
        } catch (ex) {
            logger.error("Strava.getUpcomingClubEvents", `User ${user.id} ${user.displayName}`, `Next ${days} days`, ex)
            throw ex
        }
    }
}

// Exports...
export default StravaClubs.Instance
