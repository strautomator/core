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
import jaul = require("jaul")
import logger = require("anyhow")
import dayjs from "../dayjs"
const ical = require("ical-generator").default
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
                options.sportTypes = null
            }

            // Get calendar template from user.
            const calendarTemplate: UserCalendarTemplate = user.calendarTemplate || {}

            // Days and timestamp calculations.
            const pastDays = user.isPro ? settings.plans.pro.pastCalendarDays : settings.plans.free.pastCalendarDays
            const futureDays = user.isPro ? settings.plans.pro.futureCalendarDays : settings.plans.free.futureCalendarDays
            const minDate = dayjs.utc().hour(0).minute(0).subtract(pastDays, "days")
            const maxDate = dayjs.utc().hour(0).minute(0).add(futureDays, "days")
            const dateFrom = options.dateFrom ? options.dateFrom : minDate
            const dateTo = options.dateFrom ? options.dateFrom : maxDate
            const tsAfter = dateFrom.valueOf() / 1000
            const tsBefore = dateTo.valueOf() / 1000

            optionsLog = `Since ${dayjs(dateFrom).format("YYYY-MM-DD")}, `
            optionsLog += options.sportTypes ? options.sportTypes.join(", ") : "all sports"
            if (options.excludeCommutes) optionsLog += ", exclude commutes"

            // Date validation checks.
            if (minDate.isAfter(dateFrom)) {
                throw new Error(`Minimum accepted date for the calendar is ${minDate.format("l")} (${pastDays} days)`)
            }
            if (maxDate.isAfter(dateTo)) {
                throw new Error(`Maximum accepted date for the calendar is ${minDate.format("l")} (${futureDays} days)`)
            }

            // Use "default" if no options were passed, otherwise get a hash to fetch the correct cached calendar.
            const hash = crypto.createHash("sha1").update(JSON.stringify(options, null, 0)).digest("hex").substring(0, 12)
            const cacheId = `${user.id}-${hash}`
            cachedCalendar = await database.get("calendar", cacheId)

            // See if cached version of the calendar is still valid.
            // Check cached calendar expiry date (reversed / backwards) and if user has new activity since the last generated output.
            if (cachedCalendar) {
                const expiryDate = dayjs.utc().subtract(settings.calendar.cacheDuration, "seconds").toDate()
                const maxExpiryDate = dayjs.utc().subtract(settings.calendar.maxCacheDuration, "seconds").toDate()
                const updatedTs = cachedCalendar.dateUpdated.valueOf()
                const notExpired = expiryDate.valueOf() < updatedTs
                const notChanged = user.dateLastActivity && user.dateLastActivity.valueOf() < updatedTs && maxExpiryDate.valueOf() < updatedTs

                if (notExpired || notChanged) {
                    logger.info("Calendar.generate", `User ${user.id} ${user.displayName}`, `${optionsLog}`, "From cache")
                    return cachedCalendar.data
                }
            }

            const startTime = dayjs().unix()
            const logOptions = _.map(_.toPairs(options), (r) => r.join("="))
            logger.info("Calendar.generate", `User ${user.id} ${user.displayName}`, logOptions.join(" | "))

            // Set calendar name based on passed filters.
            let calName = settings.calendar.name
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

            // Get activities from Strava?
            if (options.activities) {
                const activities = await strava.activities.getActivities(user, {before: tsBefore, after: tsAfter})

                // Iterate activities from Strava, checking filters before proceeding.
                for (let activity of activities) {
                    const arrDetails = []

                    // Stop here if the activity was excluded on the calendar options.
                    if (options.sportTypes && options.sportTypes.indexOf(activity.type) < 0) continue
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

                    // Replace gear object with the gear name.
                    if (activity.gear && activity.gear.name) {
                        activity.gear = activity.gear.name as any
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
                            uid: `a-${activity.id}`,
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
                        logger.error("Calendar.generate", `User ${user.id} ${user.displayName}`, `Activity ${activity.id}`, innerEx)
                    }
                }
            }

            // Get club events?
            if (options.clubs) {
                try {
                    const clubs = await strava.clubs.getClubs(user)

                    // Iterate user's clubs to get their events and push to the calendar.
                    for (let club of clubs) {
                        const clubEvents = await strava.clubs.getClubEvents(user, club.id)

                        for (let clubEvent of clubEvents) {
                            for (let eDate of clubEvent.dates) {
                                if (minDate.isAfter(eDate) || maxDate.isBefore(eDate)) continue

                                const event = cal.createEvent({
                                    uid: `e-${clubEvent.id}`,
                                    start: eDate,
                                    end: dayjs(eDate).add(1, "hour"),
                                    summary: `${clubEvent.title} ${getSportIcon(clubEvent)}`,
                                    description: `${club.name}\n\n${clubEvent.description}`,
                                    url: `https://www.strava.com/clubs/${club.id}/group_events/${clubEvent.id}`
                                })

                                // Location available?
                                if (clubEvent.address) {
                                    event.location(clubEvent.address)
                                }

                                // Organizer available?
                                if (clubEvent.organizer) {
                                    event.organizer({name: `${clubEvent.organizer.firstName} ${clubEvent.organizer.lastName}`})
                                }
                            }
                        }
                    }
                } catch (clubEx) {
                    logger.error("Calendar.generate", `User ${user.id} ${user.displayName}`, `Failed to create club events`, clubEx)
                }
            }

            // Send calendar output to the database.
            cachedCalendar = {
                id: cacheId,
                userId: user.id,
                data: cal.toString(),
                dateUpdated: dayjs.utc().toDate()
            }

            // Only save to database if a cacheDUration is set.
            if (settings.calendar.cacheDuration) {
                await database.set("calendar", cachedCalendar, cacheId)
            }

            const duration = dayjs().unix() - startTime
            logger.info("Calendar.generate", `User ${user.id} ${user.displayName}`, `${optionsLog}`, `${cal.events().length} events`, `Generated in ${duration} seconds`)

            return cachedCalendar.data
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
}

// Exports...
export default Calendar.Instance
