// Strautomator Core: Calendar

import {CachedCalendar, CalendarOptions} from "./types"
import {UserCalendarTemplate, UserData} from "../users/types"
import {recipePropertyList} from "../recipes/lists"
import {getSportIcon, transformActivityFields} from "../strava/utils"
import _ = require("lodash")
import crypto = require("crypto")
import database from "../database"
import eventManager from "../eventmanager"
import strava from "../strava"
import ical, {ICalCalendar} from "ical-generator"
import jaul = require("jaul")
import logger = require("anyhow")
import dayjs from "../dayjs"
const settings = require("setmeup").settings

/**
 * Messages manager.
 */
export class Calendar {
    private constructor() {}
    private static _instance: Calendar
    static get Instance() {
        return this._instance || (this._instance = new this())
    }

    // INIT
    // --------------------------------------------------------------------------

    /**
     * Init the Calendar manager.
     */
    init = async (): Promise<void> => {
        try {
            if (!settings.calendar.cacheDuration) {
                logger.warn("Calendar.init", "No cacheDuration set, calendars output will NOT be cached")
            } else {
                const duration = dayjs.duration(settings.calendar.cacheDuration, "seconds").humanize()
                logger.info("Calendar.init", `Cache calendars for ${duration}`)
            }
        } catch (ex) {
            logger.error("Calendar.init", ex)
            throw ex
        }

        eventManager.on("Users.delete", this.onUserDelete)
    }

    /**
     * Delete user calendars after it gets deleted from the database.
     * @param user User that was deleted from the database.
     */
    private onUserDelete = async (user: UserData): Promise<void> => {
        try {
            const counter = await database.delete("calendar", ["userId", "==", user.id])

            if (counter > 0) {
                logger.info("Calendar.onUsersDelete", `User ${user.id} ${user.displayName}`, `Deleted ${counter} calendars`)
            }
        } catch (ex) {
            logger.error("Calendar.onUsersDelete", `User ${user.id} ${user.displayName}`, ex)
        }
    }

    // DATABASE METHODS
    // --------------------------------------------------------------------------

    /**
     * Get list of cached calendars that have expired.
     */
    getExpired = async (): Promise<CachedCalendar[]> => {
        try {
            const minDate = dayjs.utc().add(settings.calendar.maxCacheDuration, "seconds").toDate()
            const queries = [["dateUpdated", "<", minDate]]

            const expiredCalendars: CachedCalendar[] = await database.search("calendar", queries)
            const logDetail = expiredCalendars.length > 0 ? `${expiredCalendars.length} expired calendars` : "No expired calendars"

            logger.info("Calendar.getExpired", logDetail)
            return expiredCalendars
        } catch (ex) {
            logger.error("Calendar.getExpired", ex)
            throw ex
        }
    }

    /**
     * Delete the specified cached calendar from the database.
     * @param cacheId Cached calendar ID.
     */
    delete = async (cacheId: string): Promise<void> => {
        try {
            if (!cacheId) throw new Error("Missing cacheId")

            await database.delete("calendar", cacheId)
            logger.info("Calendar.delete", cacheId)
        } catch (ex) {
            logger.error("Calendar.delete", cacheId, ex)
            throw ex
        }
    }

    // GENERATION
    // --------------------------------------------------------------------------

    /**
     * Generate the Strautomator calendar and return its iCal string representation.
     * @param user The user requesting the calendar.
     * @param options Calendar generation options.
     */
    generate = async (user: UserData, options?: CalendarOptions): Promise<string> => {
        let optionsLog: string
        let cachedCalendar: CachedCalendar

        try {
            if (!options) throw new Error("Missing calendar options")

            // Check and set default options.
            if (!options.sportTypes || options.sportTypes.length == 0) {
                delete options.sportTypes
            }

            optionsLog = _.map(_.toPairs(options), (r) => r.join("=")).join(" | ")

            // Days and timestamp calculations.
            const pastDays = user.isPro ? settings.plans.pro.pastCalendarDays : settings.plans.free.pastCalendarDays
            const futureDays = user.isPro ? settings.plans.pro.futureCalendarDays : settings.plans.free.futureCalendarDays
            const minDate = dayjs.utc().hour(0).minute(0).subtract(pastDays, "days")
            const maxDate = dayjs.utc().hour(0).minute(0).add(futureDays, "days")
            const dateFrom = options.dateFrom ? dayjs(options.dateFrom) : minDate
            const dateTo = options.dateFrom ? dayjs(options.dateFrom) : maxDate

            // Date validation checks.
            if (minDate.isAfter(dateFrom)) {
                throw new Error(`Minimum accepted date for the calendar is ${minDate.format("l")} (${pastDays} days)`)
            }
            if (maxDate.isAfter(dateTo)) {
                throw new Error(`Maximum accepted date for the calendar is ${minDate.format("l")} (${futureDays} days)`)
            }

            const startTime = dayjs().unix()

            // Use "default" if no options were passed, otherwise get a hash to fetch the correct cached calendar.
            const hash = crypto.createHash("sha1").update(JSON.stringify(options, null, 0)).digest("hex").substring(0, 12)
            const cacheId = `${user.id}-${hash}`
            const cacheDoc = database.doc("calendar", cacheId)
            const cacheData = await cacheDoc.get()

            // See if cached version of the calendar is still valid.
            // Check cached calendar expiry date (reversed / backwards) and if user has new activity since the last generated output.
            if (cacheData.exists) {
                try {
                    cachedCalendar = database.transformData(cacheData.data()) as CachedCalendar

                    const expiryDate = dayjs.utc().subtract(settings.calendar.cacheDuration, "seconds").toDate()
                    const maxExpiryDate = dayjs.utc().subtract(settings.calendar.maxCacheDuration, "seconds").toDate()
                    const updatedTs = cachedCalendar.dateUpdated.valueOf()
                    const notExpired = expiryDate.valueOf() <= updatedTs
                    const notChanged = user.dateLastActivity && user.dateLastActivity.valueOf() <= updatedTs && maxExpiryDate.valueOf() <= updatedTs

                    // Return cached calendar if it has not expired or has not changed.
                    // If data is stored in shards, rebuild it first.
                    if (notExpired || notChanged) {
                        if (cachedCalendar.shards) {
                            cachedCalendar.data = ""

                            const shardDocs = await cacheDoc.collection("shards").get()
                            const shardMap = (s) => s.data()
                            const shards = _.orderBy(shardDocs.docs.map(shardMap), "index")

                            for (let shard of shards) {
                                cachedCalendar.data += shard.data().data
                            }
                        }

                        logger.info("Calendar.generate.fromCache", `User ${user.id} ${user.displayName}`, optionsLog, "From cache")
                        return cachedCalendar.data
                    } else {
                        logger.info("Calendar.generate.fromCache", `User ${user.id} ${user.displayName}`, optionsLog, `Cache invalidated, will generate a new calendar`)
                    }
                } catch (cacheEx) {
                    logger.error("Calendar.generate.fromCache", `User ${user.id} ${user.displayName}`, optionsLog, cacheEx)
                }
            }

            logger.info("Calendar.generate", `User ${user.id} ${user.displayName}`, optionsLog)

            // Set calendar name based on passed filters.
            let calName = settings.calendar.name
            if (!options.activities) calName += ` clubs`
            if (!options.clubs) calName += ` activities`
            if (options.sportTypes) calName += ` (${options.sportTypes.join(", ")})`

            // Prepare calendar details.
            const domain = new URL(settings.app.url).hostname
            const prodId = {company: "Devv", product: "Strautomator", language: "EN"}
            const calUrl = `${settings.app.url}calendar/${user.urlToken}`

            // Create ical container.
            const icalOptions = {
                name: calName,
                domain: domain,
                prodId: prodId,
                url: calUrl,
                ttl: settings.calendar.ttl
            }
            const cal = ical(icalOptions)

            // Force set the dates from and to so we can build the activities / club events.
            options.dateFrom = dateFrom.toDate()
            options.dateTo = dateTo.toDate()

            // Get activities from Strava?
            if (options.activities) {
                await this.buildActivities(user, options, cal)
            }

            // Get club events?
            if (options.clubs) {
                await this.buildClubs(user, options, cal)
            }

            const output = cal.toString()
            const duration = dayjs().unix() - startTime
            const size = output.length / 1000 / 1024
            const maxSize = 0.95

            // Only save to database if a cacheDuration is set.
            if (settings.calendar.cacheDuration) {
                cachedCalendar = {
                    id: cacheId,
                    userId: user.id,
                    dateUpdated: dayjs.utc().toDate()
                }

                // If calendar is smaller than 0.95MB, save it on a single data field,
                // otherwise split into multiple documents in the "shards" sub-collection.
                if (size <= maxSize) {
                    delete cachedCalendar.shards
                    cachedCalendar.data = output

                    await database.set("calendar", cachedCalendar, cacheId)
                } else {
                    delete cachedCalendar.data
                    const doc = database.doc("calendar", cacheId)
                    const shardCount = 1 + Math.floor(size / maxSize)
                    const chunkSize = Math.floor(output.length / shardCount)

                    for (let i = 0; i < shardCount; i++) {
                        const index = i * chunkSize
                        const chunk = output.substring(index, index + chunkSize)
                        doc.collection("shards").add({index: index, data: chunk})
                    }

                    await doc.set(cachedCalendar)
                }
            }

            logger.info("Calendar.generate", `User ${user.id} ${user.displayName}`, `${optionsLog}`, `${cal.events().length} events`, `${size.toFixed(2)} MB`, `Generated in ${duration} seconds`)
            return output
        } catch (ex) {
            if (cachedCalendar && cachedCalendar.data) {
                logger.error("Calendar.generate", `User ${user.id} ${user.displayName}`, `${optionsLog}`, ex, "Fallback to cached calendar")
                return cachedCalendar.data
            } else {
                logger.error("Calendar.generate", `User ${user.id} ${user.displayName}`, `${optionsLog}`, ex)
                throw ex
            }
        }
    }

    /**
     * Build the user activities events in the calendar.
     * @param user The user.
     * @param options Calendar options.
     * @param cal The ical instance.
     */
    private buildActivities = async (user: UserData, options: CalendarOptions, cal: ICalCalendar): Promise<void> => {
        const fromLog = dayjs(options.dateFrom).format("YYYY-MM-DD")
        const toLog = dayjs(options.dateFrom).format("YYYY-MM-DD")
        const optionsLog = `From ${fromLog} to ${toLog}`
        let eventCount = 0

        try {
            const calendarTemplate: UserCalendarTemplate = user.calendarTemplate || {}
            const tsAfter = options.dateFrom.valueOf() / 1000
            const tsBefore = options.dateTo.valueOf() / 1000

            // Fetch user activities.
            const activities = await strava.activities.getActivities(user, {before: tsBefore, after: tsAfter})

            // Iterate activities from Strava, checking filters before proceeding.
            for (let activity of activities) {
                const arrDetails = []

                // Stop here if the activity was excluded on the calendar options.
                if (options.sportTypes && !options.sportTypes.includes(activity.type)) continue
                if (options.excludeCommutes && activity.commute) continue

                // For whatever reason Strava sometimes returned no dates on activities, so adding this extra check here
                // that should go away once the root cause is identified.
                if (!activity.dateStart || !activity.dateEnd) {
                    logger.info("Calendar.generate", `User ${user.id} ${user.displayName}`, `Activity ${activity.id} has no start or end date`)
                    continue
                }

                // Activity start and end dates.
                const startDate = activity.dateStart
                const endDate = activity.dateEnd

                // Append suffixes to activity values.
                transformActivityFields(user, activity)

                // If no event details template was set, push default values to the details array.
                if (!calendarTemplate.eventDetails) {
                    if (activity.commute) {
                        arrDetails.push("Commute")
                    }

                    // Iterate default fields to be added to the event details.
                    for (let f of settings.calendar.activityFields) {
                        const subDetails = []
                        const arrFields = f.split(",")

                        for (let field of arrFields) {
                            field = field.trim()

                            if (activity[field]) {
                                const fieldInfo = _.find(recipePropertyList, {value: field})
                                const fieldName = fieldInfo ? fieldInfo.text : field.charAt(0).toUpperCase() + field.slice(1)
                                subDetails.push(`${fieldName}: ${activity[field]}`)
                            }

                            arrDetails.push(subDetails.join(" - "))
                        }
                    }
                }

                // Replace boolean tags with yes or no.
                for (let field of Object.keys(activity)) {
                    if (activity[field] === true) activity[field] = "yes"
                    else if (activity[field] === false) activity[field] = "no"
                }

                // Get summary and details from options or from defaults.
                try {
                    const summaryTemplate = calendarTemplate.eventSummary ? calendarTemplate.eventSummary : settings.calendar.eventSummary
                    const summary = jaul.data.replaceTags(summaryTemplate, activity)
                    const details = calendarTemplate.eventDetails ? jaul.data.replaceTags(calendarTemplate.eventDetails, activity) : arrDetails.join("\n")

                    // Add activity to the calendar as an event.
                    const event = cal.createEvent({
                        start: startDate,
                        end: endDate,
                        summary: summary,
                        description: details,
                        url: `https://www.strava.com/activities/${activity.id}`
                    })

                    // Geo location available?
                    if (activity.locationEnd && activity.locationEnd.length > 0) {
                        event.location(activity.locationEnd.join(", "))
                    }
                } catch (innerEx) {
                    logger.error("Calendar.buildActivities", `User ${user.id} ${user.displayName}`, `Activity ${activity.id}`, innerEx)
                }

                eventCount++
            }

            logger.debug("Calendar.buildActivities", `User ${user.id} ${user.displayName}`, optionsLog, `Got ${eventCount} activity events`)
        } catch (ex) {
            logger.error("Calendar.buildActivities", `User ${user.id} ${user.displayName}`, optionsLog, ex)
        }
    }

    /**
     * Build the club events in the calendar.
     * @param user The user.
     * @param options Calendar options.
     * @param cal The ical instance.
     */
    private buildClubs = async (user: UserData, options: CalendarOptions, cal: ICalCalendar): Promise<void> => {
        const today = dayjs().hour(0).toDate()
        const fromLog = dayjs(options.dateFrom).format("YYYY-MM-DD")
        const toLog = dayjs(options.dateFrom).format("YYYY-MM-DD")
        const optionsLog = `From ${fromLog} to ${toLog}`
        let eventCount = 0

        try {
            const clubs = await strava.clubs.getClubs(user)

            // Iterate user's clubs to get their events and push to the calendar.
            for (let club of clubs) {
                if (!options.includeAllCountries && club.country != user.profile.country) {
                    logger.debug("Calendar.buildClubs", `User ${user.id} ${user.displayName}`, `Club ${club.id} from another country (${club.country}), skip it`)
                    continue
                }

                const clubEvents = await strava.clubs.getClubEvents(user, club.id)

                for (let clubEvent of clubEvents) {
                    if (options.sportTypes && !options.sportTypes.includes(clubEvent.type)) continue
                    if (options.excludeNotJoined && !clubEvent.joined) continue

                    // Check if event has future dates.
                    const hasFutureDate = clubEvent.dates.find((d) => d > today)

                    // Club has a route set? Fetch its details.
                    if (hasFutureDate && clubEvent.route && clubEvent.route.id) {
                        try {
                            clubEvent.route = await strava.routes.getRoute(user, clubEvent.route.id)
                        } catch (routeEx) {
                            logger.debug("Calendar.buildClubs", `User ${user.id} ${user.displayName}`, `Failed to fetch route for event ${clubEvent.id}`)
                        }
                    }

                    // Iterate event dates and add each one of them to the calendar.
                    for (let eventDate of clubEvent.dates) {
                        if (options.dateFrom > eventDate || options.dateTo < eventDate) continue
                        let endDate: Date

                        // Upcoming event has a route with estimated time? Use it as the end date,
                        // otherwise defaults to 10 minutes.
                        if (clubEvent.route && clubEvent.route.estimatedTime && eventDate >= today) {
                            const targetDate = dayjs(eventDate).add(clubEvent.route.estimatedTime * 1.05, "seconds")
                            const toQuarter = 15 - (targetDate.minute() % 15)
                            endDate = targetDate.add(toQuarter, "minutes").toDate()
                        } else {
                            endDate = dayjs(eventDate).add(settings.calendar.defaultDurationMinutes, "minutes").toDate()
                        }

                        // Add all relevant details to the event description.
                        const arrDescription = [club.name]
                        if (clubEvent.description) {
                            arrDescription.push(clubEvent.description)
                        }
                        if (clubEvent.route) {
                            arrDescription.push(`Route: https://strava.com/routes/${clubEvent.route.id}`)
                        }

                        const event = cal.createEvent({
                            start: eventDate,
                            end: endDate,
                            summary: `${clubEvent.title} ${getSportIcon(clubEvent)}`,
                            description: arrDescription.join("\n\n"),
                            url: `https://www.strava.com/clubs/${club.id}/group_events/${clubEvent.id}`
                        })

                        // Location available?
                        if (clubEvent.address) {
                            event.location(clubEvent.address)
                        }

                        eventCount++
                    }
                }
            }

            logger.debug("Calendar.buildClubs", `User ${user.id} ${user.displayName}`, optionsLog, `Got ${eventCount} club events`)
        } catch (ex) {
            logger.error("Calendar.buildClubs", `User ${user.id} ${user.displayName}`, optionsLog, ex)
        }
    }
}

// Exports...
export default Calendar.Instance
