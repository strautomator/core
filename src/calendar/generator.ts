// Strautomator Core: Calendar

import ical, {ICalCalendar, ICalAttendeeType, ICalAttendeeRole, ICalAttendeeStatus, ICalEventData, ICalCalendarData} from "ical-generator"
import {FieldValue} from "@google-cloud/firestore"
import {CalendarCachedEvents, CalendarData, CalendarOutput} from "./types"
import {UserCalendarTemplate, UserData} from "../users/types"
import {recipePropertyList} from "../recipes/lists"
import {StravaActivity, StravaBaseSport, StravaClub, StravaClubEvent, StravaRideType, StravaRunType} from "../strava/types"
import {getSportIcon, transformActivityFields} from "../strava/utils"
import {translation} from "../translations"
import _ from "lodash"
import komoot from "../komoot"
import maps from "../maps"
import strava from "../strava"
import jaul from "jaul"
import logger from "anyhow"
import * as logHelper from "../loghelper"
import dayjs from "../dayjs"
const settings = require("setmeup").settings

/**
 * Messages manager.
 */
export class CalendarGenerator {
    private constructor() {}
    private static _instance: CalendarGenerator
    static get Instance() {
        return this._instance || (this._instance = new this())
    }

    /**
     * Generate a calendar and return its iCal string representation.
     * @param user The user requesting the calendar.
     * @param dbCalendar The calendar data, including options.
     * @param cachedEvents Cached activities and club events to be added to the calendar.
     */
    build = async (user: UserData, dbCalendar: CalendarData, cachedEvents: CalendarCachedEvents): Promise<CalendarOutput> => {
        const now = dayjs().utc()
        const startTime = now.unix()
        const optionsLog = _.map(_.toPairs(dbCalendar.options), (r) => r.join("=")).join(" | ")

        try {
            let calName = settings.calendar.name
            if (!dbCalendar.options.activities) calName += ` / clubs`
            if (!dbCalendar.options.clubs) calName += ` / activities`
            if (dbCalendar.options.sportTypes) calName += ` / ${dbCalendar.options.sportTypes.join(", ")})`

            // Create ical container.
            const calData: ICalCalendarData = {
                name: calName,
                prodId: {company: "Devv", product: "Strautomator", language: "EN"},
                url: `${settings.app.url}calendar/${user.urlToken}`,
                ttl: user.isPro ? settings.plans.pro.calendarCacheDuration : settings.plans.free.calendarCacheDuration
            }
            const cal = ical(calData)

            logger.info("Calendar.build", logHelper.user(user), `${optionsLog}`, "Build starting")

            // Build activities and clubs according to the options.
            dbCalendar.cacheCount = 0
            if (dbCalendar.options.activities) {
                dbCalendar.activityCount = 0
                await this.buildActivities(user, dbCalendar, cachedEvents, cal)
            }
            if (dbCalendar.options.clubs) {
                dbCalendar.clubEventCount = 0
                await this.buildClubs(user, dbCalendar, cachedEvents, cal)
            }

            // First time this calendar is being generated? Set the pendingUpdate flag for a full rebuild, otherwise clear it.
            const isPartialFirst = !dbCalendar.dateAccess && settings.calendar.partialFirstBuild
            if (isPartialFirst) {
                dbCalendar.pendingUpdate = true
            } else if (dbCalendar.pendingUpdate) {
                dbCalendar.pendingUpdate = FieldValue.delete() as any
            }

            const outputIcs = cal.toString()
            const duration = dayjs.utc().unix() - startTime
            const size = outputIcs.length / 1000 / 1024
            const eventCount = (dbCalendar.activityCount || 0) + (dbCalendar.clubEventCount || 0)

            // Remove recent events from the cached config output.
            const minCacheDate = now.subtract(settings.calendar.minAgeForCachingDays, "days")
            const removed = _.remove(cal.events(), (e) => minCacheDate.isBefore(dayjs(e.start() as any))).length

            logger.info("Calendar.build", logHelper.user(user), `${optionsLog}`, `${eventCount} total events, ${isPartialFirst ? eventCount : removed} won't be cached`, `${size.toFixed(2)} MB`, `Generated in ${duration} seconds`)

            // If this is the first partial build, we don't want to cache anything yet.
            // Otherwise, compact the cached events and map them by ID, before returning the final result.
            if (isPartialFirst) {
                return {ics: outputIcs}
            } else {
                const compactEvents = cal.toJSON().events.map((e) => _.omitBy(e, (v) => _.isNil(v) || (_.isArray(v) && v.length == 0)))
                return {ics: outputIcs, events: JSON.stringify(_.keyBy(compactEvents, "id"), null, 0)}
            }
        } catch (ex) {
            logger.error("Calendar.build", logHelper.user(user), `${optionsLog}`, ex)
            throw ex
        }
    }

    /**
     * Build the user activities events in the calendar.
     * @param user The user.
     * @param dbCalendar Calendar data.
     * @param cachedEvents Cached events.
     * @param cal The ical instance.
     */
    private buildActivities = async (user: UserData, dbCalendar: CalendarData, cachedEvents: CalendarCachedEvents, cal: ICalCalendar): Promise<void> => {
        const today = dayjs.utc().startOf("day")
        let daysFrom = dbCalendar.options.daysFrom
        let daysTo = dbCalendar.options.daysTo

        // First time that the calendar is being built? Use a shorter date range to speed
        // things up. The correct date range will be applied starting with the next build.
        const partialFirstBuild = !dbCalendar.dateAccess && settings.calendar.partialFirstBuild
        if (partialFirstBuild) {
            daysFrom = Math.ceil(daysFrom / 4)
            daysTo = Math.ceil(daysTo / 4)
        }

        const dateFrom = today.subtract(daysFrom, "days")
        const dateTo = today.add(daysTo, "days").endOf("day")
        const optionsLog = `From ${dateFrom.format("ll")} to ${dateTo.format("ll")}`
        const fieldSettings = settings.calendar.activityFields
        const calendarTemplate: UserCalendarTemplate = user.preferences?.calendarTemplate || {}

        let activities: StravaActivity[]
        try {
            logger.debug("Calendar.buildActivities", logHelper.user(user), optionsLog, "Preparing to build")

            if (cachedEvents) {
                let lastCachedDate = dateFrom

                // First we add the cached events.
                for (let id in cachedEvents) {
                    const eventData = cachedEvents[id]
                    try {
                        cal.createEvent(eventData)
                        dbCalendar.activityCount++
                        dbCalendar.cacheCount++
                    } catch (cacheEx) {
                        logger.error("Calendar.buildActivities", logHelper.user(user), `Failure adding cached event ${id}`, cacheEx)
                    }

                    // Get the date of the last cached event and use it to filter live activities
                    // by increasing the "after" query timestamp.
                    const startDate = dayjs(eventData.start as string)
                    if (lastCachedDate.isBefore(startDate)) {
                        lastCachedDate = startDate.add(1, "second")
                    }
                }

                activities = await strava.activities.getActivities(user, {after: lastCachedDate, before: dateTo})
            } else {
                activities = await strava.activities.getActivities(user, {after: dateFrom, before: dateTo})
            }

            // Iterate and process live activities.
            for (let activity of activities) {
                if (partialFirstBuild && dbCalendar.activityCount >= settings.calendar.partialFirstBuild) continue
                if (dbCalendar.options.sportTypes && !dbCalendar.options.sportTypes.includes(activity.sportType)) continue
                if (dbCalendar.options.excludeCommutes && activity.commute) continue

                // For whatever reason Strava on rare occasions Strava returned no dates on activities, so double check it here.
                if (!activity.dateStart || !activity.dateEnd) {
                    logger.info("Calendar.generate", logHelper.user(user), `${logHelper.activity(activity)} has no start or end date`)
                    continue
                }

                // Activity event metadata.
                const eventId = `activity-${activity.id}`
                const arrDetails = []
                const startDate = activity.dateStart
                const endDate = activity.dateEnd
                const sportType = activity.sportType.toLowerCase()
                const similarSportType = StravaBaseSport[activity.sportType]?.toLowerCase()
                const activityLink = `https://www.strava.com/activities/${activity.id}`

                // Append suffixes to activity values.
                transformActivityFields(user, activity, dbCalendar.options.compact)

                // Replace boolean tags with yes or no.
                for (let field of Object.keys(activity)) {
                    if (activity[field] === true) activity[field] = "yes"
                    else if (activity[field] === false) activity[field] = "no"
                }

                // If no event details template was set, push default values to the details array.
                if (!calendarTemplate.eventDetails) {
                    if (activity.workoutType == StravaRideType.Race || activity.workoutType == StravaRunType.Race) {
                        arrDetails.push("Race")
                    } else if (activity.commute === ("yes" as any)) {
                        arrDetails.push("Commute")
                    } else if (activity.trainer === ("yes" as any) && (similarSportType == "ride" || similarSportType == "run")) {
                        arrDetails.push("Virtual")
                    }

                    const activityFields = fieldSettings[sportType] || fieldSettings[similarSportType] || fieldSettings.default

                    // Iterate default fields to be added to the event details.
                    for (let f of activityFields) {
                        const subDetails = []
                        const arrFields = f.split(",")

                        for (let field of arrFields) {
                            field = field.trim()

                            if (activity[field]) {
                                const fieldInfo = _.find(recipePropertyList, {value: field})
                                const fieldName = fieldInfo ? fieldInfo.shortText || fieldInfo.text : field.charAt(0).toUpperCase() + field.slice(1)
                                subDetails.push(`${fieldName}: ${activity[field]}`)
                            }
                        }

                        arrDetails.push(subDetails.join("\n"))
                    }

                    if (dbCalendar.options.linkInDescription) {
                        arrDetails.push(activityLink)
                    }
                }

                // Get summary and details from options or from defaults.
                try {
                    const summaryTemplate = calendarTemplate?.eventSummary || settings.calendar.eventSummary
                    const summary = jaul.data.replaceTags(summaryTemplate, activity, null, true)
                    const details = calendarTemplate.eventDetails ? jaul.data.replaceTags(calendarTemplate.eventDetails, activity, null, true) : arrDetails.join(dbCalendar.options.compact ? "" : "\n")
                    const eventData: ICalEventData = {
                        id: eventId,
                        start: startDate,
                        end: endDate,
                        summary: summary,
                        description: details,
                        url: activityLink
                    }

                    // Geo location available?
                    if (activity.locationEnd?.length > 0) {
                        let locationString: string = activity.locationEnd.join(", ")

                        // PRO users will have the location parsed into an address.
                        if (user.isPro) {
                            try {
                                const address = await maps.getReverseGeocode(activity.locationEnd)
                                locationString = _.values(_.pick(address, ["neighborhood", "city", "country"])).join(", ")
                            } catch (locationEx) {
                                logger.error("Calendar.buildActivities", logHelper.user(user), logHelper.activity(activity), `Can't fetch address for ${locationString}`)
                            }
                        }

                        if (locationString) {
                            eventData.location = locationString
                        }
                    }

                    // Add activity to the calendar.
                    cal.createEvent(eventData)
                    dbCalendar.activityCount++
                } catch (innerEx) {
                    logger.error("Calendar.buildActivities", logHelper.user(user), logHelper.activity(activity), innerEx)
                }
            }
        } catch (ex) {
            logger.error("Calendar.buildActivities", logHelper.user(user), optionsLog, ex)
        }
    }

    /**
     * Build the club events in the calendar.
     * @param user The user.
     * @param dbCalendar Calendar data.
     * @param cachedEvents Cached events.
     * @param cal The ical instance.
     */
    private buildClubs = async (user: UserData, dbCalendar: CalendarData, cachedEvents: CalendarCachedEvents, cal: ICalCalendar): Promise<void> => {
        const today = dayjs.utc().startOf("day")
        let daysFrom = dbCalendar.options.daysFrom
        let daysTo = dbCalendar.options.daysTo

        // First time that the calendar is being built? Use a shorter date range
        // to speed things up. The correct ranges will be applied from then on.
        const partialFirstBuild = !dbCalendar.dateAccess && settings.calendar.partialFirstBuild
        if (partialFirstBuild) {
            daysFrom = Math.ceil(daysFrom / 2)
            daysTo = Math.ceil(daysTo / 2)
        }

        const dateFrom = today.subtract(daysFrom, "days")
        const dateTo = today.add(daysTo, "days").endOf("day")
        const optionsLog = `From ${dateFrom.format("ll")} to ${dateTo.format("ll")}`
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
                    for (let startDate of clubEvent.dates) {
                        if (dateFrom.isAfter(startDate) || dateTo.isBefore(startDate)) continue
                        let endDate = dayjs(startDate).add(settings.calendar.eventDurationMinutes, "minutes").toDate()

                        const eventTimestamp = Math.round(startDate.valueOf() / 1000)
                        const eventId = `${clubEvent.id}-${eventTimestamp}`
                        const estimatedTime = clubEvent.route ? clubEvent.route.totalTime : 0

                        // Upcoming event has a route with estimated time? Use it for the end date, otherwise get the end date
                        // from the cached events, and if not found, defaults to 15min.
                        if (today.isBefore(startDate) && estimatedTime > 0) {
                            endDate = dayjs(startDate).add(estimatedTime, "seconds").toDate()
                        } else if (cachedEvents) {
                            const existing = cachedEvents[`club-${eventId}`]
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
                            id: `club-${eventId}`,
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
}

// Exports...
export default CalendarGenerator.Instance
