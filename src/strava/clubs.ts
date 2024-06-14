// Strautomator Core: Strava Clubs

import {StravaClub, StravaClubEvent} from "./types"
import {toStravaClub, toStravaClubEvent} from "./utils"
import {UserData} from "../users/types"
import stravaRoutes from "./routes"
import api from "./api"
import komoot from "../komoot"
import dayjs from "../dayjs"
import _ from "lodash"
import logger from "anyhow"
import * as logHelper from "../loghelper"
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
     * Get athlete clubs from Strava. Free users will be limited to the first page of clubs.
     * @param user User data.
     */
    getClubs = async (user: UserData): Promise<StravaClub[]> => {
        try {
            const result: StravaClub[] = []
            let page = 1

            // Keep fetching till we get all clubs.
            while (page) {
                const pageSize = user.isPro ? settings.strava.api.pageSize : settings.plans.free.maxClubs
                const data: any[] = await api.get(user.stravaTokens, "athlete/clubs", {per_page: pageSize, page: page})
                let clubs: StravaClub[] = data.map((d) => toStravaClub(d))

                // Full pagination is limited to PRO users.
                // Check here if we should proceed based on the page size and number of clubs returned.
                if (!user.isPro) {
                    clubs = clubs.slice(0, pageSize)
                    page = null
                } else if (clubs.length < pageSize) {
                    page = null
                } else {
                    page++
                }

                result.push(...clubs)
            }

            logger.info("Strava.getClubs", logHelper.user(user), `Got ${result.length} clubs`)
            return result
        } catch (ex) {
            logger.error("Strava.getClubs", logHelper.user(user), ex)
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

            logger.info("Strava.getClub", logHelper.user(user), `Club ${id}: ${club.name} @ ${club.country}`)
            return club
        } catch (ex) {
            logger.error("Strava.getClub", logHelper.user(user), `Club ${id}`, ex)
            throw ex
        }
    }

    /**
     * Get list of events for the specified club.
     * Older events and far-future events will be removed from the response.
     * @param user User data.
     * @param id The club ID.
     */
    getClubEvents = async (user: UserData, id: string): Promise<StravaClubEvent[]> => {
        try {
            const now = dayjs().utc()
            const maxDate = now.add(settings.strava.clubs.maxAgeDays, "days")
            const minDate = now.subtract(settings.strava.clubs.maxAgeDays, "days")

            // Helper to discard events that are out of the allowed event range,
            // as well as unnecessary event details.
            const preProcessor = (clubEvents: any): void => {
                try {
                    const totalCount = clubEvents.length
                    _.remove(clubEvents, (ce: any) => {
                        return !ce.upcoming_occurrences.find((o) => {
                            const eventDate = dayjs(o)
                            return eventDate.isBefore(maxDate) && eventDate.isAfter(minDate)
                        })
                    })
                    clubEvents.forEach((ce) => {
                        if (ce.organizing_athlete) {
                            ce.organizing_athlete = _.pick(ce.organizing_athlete, ["id", "username", "firstname", "lastname", "friend", "country"])
                        }
                    })
                    if (clubEvents.length < totalCount) {
                        logger.info("Strava.getClubEvents.preProcessor", logHelper.user(user), `Club ${id}`, `Discarded ${totalCount - clubEvents.length} out of ${totalCount} events`)
                    }
                } catch (preEx) {
                    logger.error("Strava.getClubEvents.preProcessor", logHelper.user(user), `Club ${id}`, preEx)
                }
            }

            const data = await api.get(user.stravaTokens, `clubs/${id}/group_events`, null, preProcessor)
            if (!data) return []

            const clubEvents: StravaClubEvent[] = data.map((d) => toStravaClubEvent(d))

            logger.info("Strava.getClubEvents", logHelper.user(user), `Club ${id} has ${clubEvents.length} events`)
            return clubEvents
        } catch (ex) {
            if (ex.response?.status == 404) {
                logger.warn("Strava.getClubEvents", logHelper.user(user), `Club ${id}`, "Status 404, no events")
                return []
            }

            logger.error("Strava.getClubEvents", logHelper.user(user), `Club ${id}`, ex)
            throw ex
        }
    }

    // HELPER METHODS
    // --------------------------------------------------------------------------

    /**
     * Get upcoming club events for the specified user.
     * @param user User data.
     * @param days Return events for that many days ahead, where 0 = only today.
     * @param countries Optional list of countries to get the events for (as full country names).
     */
    getUpcomingClubEvents = async (user: UserData, days: number, countries?: string[]): Promise<StravaClubEvent[]> => {
        try {
            const today = dayjs()
            const maxDate = today.add(days, "days").endOf("day")
            const result: StravaClubEvent[] = []

            // Default to all countries.
            if (!countries || countries.length == 0) {
                countries = ["all"]
            }

            // Helper function to get club events.
            const getEvents = async (club: StravaClub) => {
                const events = await this.getClubEvents(user, club.id)

                for (let event of events) {
                    event.dates = event.dates.filter((eDate) => today.isBefore(eDate) && maxDate.isAfter(eDate))
                    if (event.dates.length == 0) continue

                    result.push(event)

                    // Sort event dates, as Strava sometimes return messed up dates.
                    event.dates.sort()

                    // We need the full route details, including distance and polyline.
                    // Try a Strava route first.
                    const idString = event?.route ? event.route["idString"] : null
                    if (idString && (!event.route.distance || !event.route.polyline)) {
                        try {
                            event.route = await stravaRoutes.getRoute(user, idString)
                        } catch (routeEx) {
                            logger.warn("Strava.getUpcomingClubEvents", logHelper.user(user), `Event ${event.title}`, "Failed to get route details")
                        }
                    }
                    // PRO users also get Komoot route parsing.
                    else if (user.isPro && event.description && event.description.length > 30) {
                        const url = komoot.extractRouteUrl(event.description)

                        if (url) {
                            const kRoute = await komoot.getRoute(user, url)

                            if (kRoute) {
                                logger.info("Strava.getUpcomingClubEvents", logHelper.user(user), `Event ${event.title}`, `Komoot route: ${kRoute.id}`)
                                event.route = kRoute
                            }
                        }
                    }
                }
            }

            // Filter clubs for the specified countries.
            const allClubs = await this.getClubs(user)
            const clubs = countries[0] == "all" ? allClubs : allClubs.filter((c) => countries.includes(c.country))

            // Iterate clubs to get the upcoming events.
            const batchSize = user.isPro ? settings.plans.pro.apiConcurrency : settings.plans.free.apiConcurrency
            while (clubs.length) {
                await Promise.allSettled(clubs.splice(0, batchSize).map(getEvents))
            }

            logger.info("Strava.getUpcomingClubEvents", logHelper.user(user), `Next ${days} days`, countries.join(", "), `${result.length || "No"} upcoming events`)
            return _.sortBy(result, (r) => r.dates[0])
        } catch (ex) {
            logger.error("Strava.getUpcomingClubEvents", logHelper.user(user), `Next ${days} days`, countries.join(", "), ex)
            throw ex
        }
    }
}

// Exports...
export default StravaClubs.Instance
