// Strautomator Core: Calendar

import {CalendarData, CalendarOptions} from "./types"
import {UserData} from "../users/types"
import {File} from "@google-cloud/storage"
import calendarGenerator from "./generator"
import _ from "lodash"
import crypto from "crypto"
import database from "../database"
import eventManager from "../eventmanager"
import storage from "../storage"
import users from "../users"
import logger from "anyhow"
import * as logHelper from "../loghelper"
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

    /**
     * Calendar generator.
     */
    generator = calendarGenerator

    // INIT
    // --------------------------------------------------------------------------

    /**
     * Init the Calendar manager.
     */
    init = async (): Promise<void> => {
        try {
            const durationFree = dayjs.duration(settings.plans.free.calendarCacheDuration, "seconds").humanize()
            const durationPro = dayjs.duration(settings.plans.pro.calendarCacheDuration, "seconds").humanize()

            logger.info("Calendar.init", `Cache durations: Free ${durationFree}, PRO ${durationPro}`)

            eventManager.on("Users.delete", this.onUserDelete)
            eventManager.on("Users.setUrlToken", this.onUrlToken)
        } catch (ex) {
            logger.error("Calendar.init", ex)
            throw ex
        }
    }

    /**
     * Delete calendars and cached events for the specified deleted user.
     * @param user User that was deleted from the database.
     */
    private onUserDelete = async (user: UserData): Promise<void> => {
        await this.deleteForUser(user, true)
    }

    /**
     * Delete calendars when the user changes the URL token.
     * @param user User that has a new URL token.
     */
    private onUrlToken = async (user: UserData): Promise<void> => {
        await this.deleteForUser(user)
    }

    // MAIN METHODS
    // --------------------------------------------------------------------------

    /**
     * Return the calendar URL for the specified user and options.
     * @param user The user requesting the calendar.
     * @param options Calendar generation options.
     */
    get = async (user: UserData, options: CalendarOptions): Promise<string> => {
        const now = dayjs.utc()
        let dbCalendar: CalendarData
        let cacheFileId: string
        let optionsLog: string

        try {
            options = _.omitBy(options, _.isNil)

            const hashContent = user.urlToken + "-" + JSON.stringify(options, null, 0)
            const calendarId = crypto.createHash("sha1").update(hashContent).digest("hex")
            dbCalendar = await database.get("calendars", calendarId)

            // If the calendar was already generated, reuse the options saved to the DB, otherwise
            // validate them and created a new database record for that specific calendar.
            if (dbCalendar) {
                options = dbCalendar.options
            } else {
                dbCalendar = {id: calendarId, userId: user.id, options: options, dateUpdated: now.toDate()}
                await this.validateOptions(user, options)
            }
            optionsLog = _.map(_.toPairs(options), (r) => r.join("=")).join(" | ")

            // Fetch cached calendar from storage (if it exists).
            cacheFileId = `${user.id}/${calendarId}.ics`
            const cachedFile = await storage.getFile("calendar", cacheFileId)

            // If the calendar is being requested for the first time, do a faster, partial generation first.
            if (!cachedFile) {
                logger.info("Calendar.get", logHelper.user(user), optionsLog, "Calendar will be generated for the first time")
                await this.generate(user, dbCalendar)
            } else {
                const onlyClubs = options.clubs && !options.activities
                const lastActivity = user.dateLastActivity || user.dateLogin || user.dateRegistered

                // Calculate the correct cache duration and check if calendar should be refreshed.
                let cacheDuration = user.isPro ? settings.plans.pro.calendarCacheDuration : settings.plans.free.calendarCacheDuration
                if (user.isPro && options.fresher) {
                    cacheDuration = cacheDuration / 2
                }
                const dateUpdated = dayjs(dbCalendar.dateUpdated)
                const minDateUpdated = dayjs().subtract(cacheDuration, "seconds")
                const shouldUpdate = dateUpdated.isBefore(minDateUpdated) && (onlyClubs || dateUpdated.isBefore(lastActivity))

                // Calendar needs to be refreshed? Set the flag for the next scheduled function.
                if (shouldUpdate) {
                    dbCalendar.pendingUpdate = true
                    logger.info("Calendar.get", logHelper.user(user), optionsLog, "Cache invalidated, calendar marked for update")
                } else {
                    logger.info("Calendar.get", logHelper.user(user), optionsLog, "Returning cached calendar")
                }
            }

            // Update calendar timestamps and save to the database.
            dbCalendar.dateAccess = now.toDate()
            dbCalendar.dateExpiry = now.add(settings.calendar.maxCacheDuration, "seconds").toDate()
            await database.merge("calendars", dbCalendar)

            // Return the calendar file URL.
            return storage.getUrl("calendar", cacheFileId)
        } catch (ex) {
            logger.error("Calendar.get", logHelper.user(user), `${optionsLog}`, ex)
            throw ex
        }
    }

    /**
     * Returns all calendars that have a pendingUpdate flag set.
     */
    getPendingUpdate = async (): Promise<CalendarData[]> => {
        try {
            const result = await database.search("calendars", ["pendingUpdate", "==", true])
            logger.info("Calendar.getPendingUpdate", `Got ${result.length || "no"} calendars to be updated`)
            return result
        } catch (ex) {
            logger.error("Calendar.getPendingUpdate", ex)
            throw ex
        }
    }

    /**
     * Get all calendars for the specified user.
     * @param user The user.
     */
    getForUser = async (user: UserData): Promise<CalendarData[]> => {
        try {
            const result = await database.search("calendars", ["userId", "==", user.id])
            logger.info("Calendar.getForUser", logHelper.user(user), `Got ${result.length || "no"} calendars`)
            return result
        } catch (ex) {
            logger.error("Calendar.getForUser", logHelper.user(user), ex)
            throw ex
        }
    }

    /**
     * Delete calendars for the specified user.
     * @param user User to have the calendars deleted.
     * @param includeCachedEvents If true, will also delete cached event details (start and end dates).
     */
    deleteForUser = async (user: UserData, includeCachedEvents?: boolean): Promise<number> => {
        const logDetails = logHelper.user(user)

        try {
            const dbWhere = ["userId", "==", user.id]
            const calendarFiles = await storage.listFiles("calendar", `${user.id}/`)

            // Also deleted cached events?
            if (includeCachedEvents) {
                const cachedEvents = await database.doc("calendars", `${user.id}-cached-events`)
                const docSnapshot = await cachedEvents.get()
                if (docSnapshot.exists) {
                    await cachedEvents.delete()
                    logger.info("Calendar.deleteForUser", logDetails, "Deleted cached events")
                }
            }

            return this.delete(logDetails, dbWhere, calendarFiles)
        } catch (ex) {
            logger.error("Calendar.deleteForUser", logDetails, ex)
            return 0
        }
    }

    /**
     * Delete cached calendars for the specified user or from the specified date.
     * Returns the total number of calendars deleted (from DB and storage).
     * @param maxAge Calendars older than this date will be deleted.
     */
    delete = async (logDetails: string, dbWhere: any[], calendarFiles: File[]): Promise<number> => {
        let dbCount = 0
        let fileCount = 0

        // First delete calendars from the database.
        try {
            dbCount = await database.delete("calendars", dbWhere)
        } catch (ex) {
            logger.error("Calendar.delete", logDetails, ex)
        }

        // Then the .ics files from the calendar storage bucket.
        try {
            for (let file of calendarFiles) {
                try {
                    await file.delete()
                    fileCount++
                } catch (fileEx) {
                    logger.error("Calendar.delete", logDetails, file.name, fileEx)
                }
            }
        } catch (ex) {
            logger.error("Calendar.delete", logDetails, ex)
        }

        if (dbCount > 0 || fileCount > 0) {
            logger.info("Calendar.delete", logDetails, `Deleted ${dbCount} from database and ${fileCount} from storage`)
        } else {
            logger.debug("Calendar.delete", logDetails, "Nothing deleted")
        }

        return dbCount + fileCount
    }

    /**
     * Validate the calendar options and adjust them if necessary.
     * @param user The user.
     * @param options Options to be validated (mutated by this method).
     */
    validateOptions = async (user: UserData, options: CalendarOptions): Promise<void> => {
        const optionsLog = _.map(_.toPairs(options), (r) => r.join("=")).join(" | ")

        try {
            const maxDaysFrom = user.isPro ? settings.plans.pro.pastCalendarDays : settings.plans.free.pastCalendarDays
            const maxDaysTo = user.isPro ? settings.plans.pro.futureCalendarDays : settings.plans.free.futureCalendarDays

            // Remove club IDs if none was passed.
            if (options.clubIds?.length == 0) {
                delete options.clubIds
            }

            // Validate PRO only features.
            if (!user.isPro && options.fresher) {
                delete options.fresher
                logger.warn("Calendar.validateOptions", logHelper.user(user), `${optionsLog}`, "Removed fresher option, only available to PRO users")
            }

            // Validate minimum and maximum dates.
            if (!options.daysFrom) {
                options.daysFrom = maxDaysFrom
            } else if (options.daysFrom > maxDaysFrom) {
                options.daysFrom = maxDaysFrom
                logger.warn("Calendar.validateOptions", logHelper.user(user), `${optionsLog}`, `Past days out of range, setting to ${maxDaysFrom}`)
            }
            if (!options.daysTo) {
                options.daysTo = maxDaysTo
            } else if (options.daysTo > maxDaysTo) {
                options.daysTo = maxDaysTo
                logger.warn("Calendar.validateOptions", logHelper.user(user), `${optionsLog}`, `Future days out of range, setting to ${maxDaysTo}`)
            }
        } catch (ex) {
            logger.error("Calendar.validateOptions", logHelper.user(user), optionsLog, ex)
        }
    }

    // GENERATION
    // --------------------------------------------------------------------------

    /**
     * This will trigger a rebuild of all calendars flagged with pendingUpdate.
     */
    regeneratePendingUpdate = async (): Promise<void> => {
        try {
            const processCalendar = async (calendar: CalendarData) => {
                const user = await users.getById(calendar.userId)
                await this.generate(user, calendar)
            }

            // Fetch pending calendars and regenerate all of them, in small batches.
            const pendingCalendars = await this.getPendingUpdate()
            const batchSize = settings.calendar.batchSize
            while (pendingCalendars.length) {
                await Promise.allSettled(pendingCalendars.splice(0, batchSize).map(processCalendar))
            }
        } catch (ex) {
            logger.error("Calendar.regeneratePendingUpdate", ex)
        }
    }

    /**
     * Build the .ics output and save to the calendar storage bucket.
     * @param user The user requesting the calendar.
     * @param dbCalendar The calendar data, including options.
     */
    generate = async (user: UserData, dbCalendar: CalendarData): Promise<string> => {
        const optionsLog = _.map(_.toPairs(dbCalendar.options), (r) => r.join("=")).join(" | ")

        try {
            const output = await calendarGenerator.build(user, dbCalendar)
            if (output) {
                dbCalendar.dateUpdated = new Date()

                await database.merge("calendars", dbCalendar)
                await storage.setFile("calendar", `${user.id}/${dbCalendar.id}.ics`, output, "text/calendar")

                logger.info("Calendar.generate", logHelper.user(user), optionsLog, `Saved to ${dbCalendar.id}`)
                return storage.getUrl("calendar", dbCalendar.id)
            }

            // Something failed, stop here.
            throw new Error("Calendar output is empty")
        } catch (ex) {
            logger.error("Calendar.generate", logHelper.user(user), optionsLog, ex)
            throw ex
        }
    }
}

// Exports...
export default Calendar.Instance
