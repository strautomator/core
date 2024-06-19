// Strautomator Core: Calendar Clubs Builder

import {ICalCalendar, ICalAttendeeType, ICalAttendeeRole, ICalAttendeeStatus, ICalEventData} from "ical-generator"
import {CalendarCachedEvents, CalendarData} from "./../types"
import {UserData} from "../../users/types"
import {StravaClub, StravaClubEvent} from "../../strava/types"
import {getSportIcon} from "../../strava/utils"
import {translation} from "../../translations"
import komoot from "../../komoot"
import strava from "../../strava"
import _ from "lodash"
import logger from "anyhow"
import * as logHelper from "../../loghelper"
import dayjs from "../../dayjs"
const settings = require("setmeup").settings

/**
 * Build the club events in the calendar. By default, club events will be
 * cached in the storage bucket so we can reuse some information in future builds.
 * @param user The user.
 * @param dbCalendar Calendar data.
 * @param cal The ical instance.
 * @param cachedEvents Cached events.
 */
export const buildClubs = async (user: UserData, dbCalendar: CalendarData, cal: ICalCalendar, cachedEvents: CalendarCachedEvents): Promise<void> => {
    const today = dayjs.utc().startOf("day")
    const daysFrom = dbCalendar.options.daysFrom
    const daysTo = dbCalendar.options.daysTo
    const dateFrom = today.subtract(daysFrom, "days")
    const dateTo = today.add(daysTo, "days").endOf("day")
    const optionsLog = `From ${dateFrom.format("ll")} to ${dateTo.format("ll")}`
    const partialFirstBuild = !dbCalendar.dateAccess && settings.calendar.partialFirstBuild
    const tOrganizer = translation("Organizer", user.preferences, true)

    try {
        logger.debug("Calendar.buildClubs", logHelper.user(user), optionsLog, "Preparing to build")

        // Helper to process club events.
        const getEvents = async (club: StravaClub) => {
            if (partialFirstBuild && dbCalendar.clubEventCount >= settings.calendar.partialFirstBuild) return

            if ((!dbCalendar.options.includeAllCountries || partialFirstBuild) && club.country != user.profile.country) {
                logger.debug("Calendar.buildClubs", logHelper.user(user), `Club ${club.id} from another country (${club.country}), skip it`)
                return
            }

            const addClubEvent = async (clubEvent: StravaClubEvent) => {
                if (partialFirstBuild && dbCalendar.clubEventCount > settings.calendar.partialFirstBuild) return
                if (dbCalendar.options.sportTypes && !dbCalendar.options.sportTypes.includes(clubEvent.type)) return
                if (dbCalendar.options.excludeNotJoined && !clubEvent.joined) return

                // Check if event has future dates.
                const hasFutureDate = clubEvent.dates.find((d) => today.isBefore(d))

                // Club has a route set? Fetch the full route details. PRO users will also
                // get distance and times from Komoot routes.
                if (hasFutureDate) {
                    const idString = clubEvent?.route ? clubEvent.route["idString"] : null
                    if (idString) {
                        try {
                            clubEvent.route = await strava.routes.getRoute(user, idString)
                        } catch (routeEx) {
                            logger.warn("Calendar.buildClubs", logHelper.user(user), `Failed to fetch route for event ${clubEvent.id}`)
                        }
                    } else if (user.isPro && clubEvent.description && clubEvent.description.length > 30) {
                        const url = komoot.extractRouteUrl(clubEvent.description)

                        // Found a Komoot route URL? Try extracting its metadata from their API.
                        if (url) {
                            const kRoute = await komoot.getRoute(user, url)
                            if (kRoute) {
                                logger.info("Strava.buildClubs", logHelper.user(user), `Event ${clubEvent.title}`, `Komoot route: ${kRoute.id}`)
                                clubEvent.route = kRoute
                            }
                        }
                    }
                }

                // Iterate event dates and add each one of them to the calendar.
                // If it's the first build, sort dates by proximity to today.
                const eventDates = partialFirstBuild ? _.sortBy(clubEvent.dates, (d) => Math.abs(today.diff(d, "hours"))) : clubEvent.dates
                for (let startDate of eventDates) {
                    if (dateFrom.isAfter(startDate) || dateTo.isBefore(startDate)) continue
                    let endDate = dayjs(startDate).add(settings.calendar.eventDurationMinutes, "minutes").toDate()

                    const eventTimestamp = Math.round(startDate.valueOf() / 1000)
                    const eventId = `club-${clubEvent.id}-${eventTimestamp}`
                    const estimatedTime = clubEvent.route ? clubEvent.route.totalTime : 0

                    // Upcoming event has a route with estimated time? Use it for the end date, otherwise get the end date
                    // from the cached events, and if not found, defaults to 15min.
                    if (today.isBefore(startDate) && estimatedTime > 0) {
                        endDate = dayjs(startDate).add(estimatedTime, "seconds").toDate()
                    } else if (cachedEvents) {
                        const existing = cachedEvents[eventId]
                        if (existing) {
                            endDate = dayjs(existing.end as string).toDate()
                            dbCalendar.cacheCount++
                        }
                    }

                    const eventLink = `https://www.strava.com/clubs/${club.id}/group_events/${clubEvent.id}`
                    const organizer = clubEvent.organizer ? `${clubEvent.organizer.firstName} ${clubEvent.organizer.lastName}` : null

                    // Add all relevant details to the event description.
                    const arrDescription = [`${club.name}\n`]
                    if (clubEvent.description) {
                        arrDescription.push(`${dbCalendar.options.compact ? clubEvent.description.replace(/\n/g, " ") : clubEvent.description}\n`)
                    }
                    if (!dbCalendar.options.compact) {
                        if (clubEvent.joined) {
                            arrDescription.push("Attending: yes")
                        }
                        if (organizer) {
                            arrDescription.push(`${tOrganizer}: ${organizer}\n`)
                        }
                    }
                    if (dbCalendar.options.linkInDescription) {
                        arrDescription.push(eventLink)
                    }

                    // Base event data.
                    const eventData: ICalEventData = {
                        id: eventId,
                        start: startDate,
                        end: endDate,
                        summary: `${clubEvent.title} ${getSportIcon(clubEvent)}`,
                        description: arrDescription.join("\n"),
                        url: eventLink
                    }

                    // Attending to the calendar and user has an email set?
                    // Add user to the list of attendees.
                    if (user.email && clubEvent.joined) {
                        eventData.attendees = [
                            {
                                status: ICalAttendeeStatus.ACCEPTED,
                                role: ICalAttendeeRole.OPT,
                                type: ICalAttendeeType.INDIVIDUAL,
                                email: user.email
                            }
                        ]
                    }

                    // Location available?
                    if (clubEvent.address) {
                        eventData.location = clubEvent.address
                    }

                    // Add club event to the calendar.
                    cal.createEvent(eventData)
                    dbCalendar.clubEventCount++
                }
            }

            const clubEvents = await strava.clubs.getClubEvents(user, club.id)

            // Iterate user's club events to get their details and push to the calendar.
            const batchSize = user.isPro ? settings.plans.pro.apiConcurrency : settings.plans.free.apiConcurrency
            while (clubEvents.length) {
                await Promise.allSettled(clubEvents.splice(0, batchSize).map(addClubEvent))
            }
        }

        // Get relevant clubs (all, or filtered by ID).
        const allClubs = await strava.clubs.getClubs(user)
        const clubFilter = (c: StravaClub) => dbCalendar.options.clubIds.includes(c.id.toString()) || (c.url && dbCalendar.options.clubIds.includes(c.url))
        let clubs = dbCalendar.options.clubIds?.length > 0 ? allClubs.filter(clubFilter) : allClubs

        // Free accounts have a limit on how many clubs can be processed.
        if (clubs.length > settings.plans.free.maxClubs) {
            clubs = clubs.splice(0, settings.plans.free.maxClubs)
        }

        // Iterate user's clubs to get their events and push to the calendar.
        const batchSize = user.isPro ? settings.plans.pro.apiConcurrency : settings.plans.free.apiConcurrency
        while (clubs.length) {
            await Promise.allSettled(clubs.splice(0, batchSize).map(getEvents))
        }
    } catch (ex) {
        logger.error("Calendar.buildClubs", logHelper.user(user), optionsLog, ex)
    }
}
