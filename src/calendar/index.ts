// Strautomator Core: Calendar

import {CalendarData, CalendarOptions} from "./types"
import {StravaActivity} from "../strava/types"
import {UserData} from "../users/types"
import calendarGenerator from "./generator"
import _ from "lodash"
import crypto from "crypto"
import database from "../database"
import eventManager from "../eventmanager"
import storage from "../storage"
import jaul from "jaul"
import logger from "anyhow"
import * as logHelper from "../loghelper"
import dayjs from "../dayjs"
import {File} from "@google-cloud/storage"
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

    /**
     * Map of IDs and timestamps of the calendars being built at the moment.
     */
    building: {[calendarId: string]: Date} = {}

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

            eventManager.on("Strava.deleteActivity", this.onDeleteActivity)
            eventManager.on("Strava.processActivity", this.onProcessActivity)
            eventManager.on("Users.delete", this.deleteForUser)
            eventManager.on("Users.setUrlToken", this.deleteForUser)
            eventManager.on("Users.setCalendarTemplate", this.deleteForUser)
        } catch (ex) {
            logger.error("Calendar.init", ex)
            throw ex
        }
    }

    /**
     * Remove the activity from cached calendar events if the user deletes it from Strava.
     * @param user The user.
     * @param activityId The Strava activity ID.
     */
    private onDeleteActivity = async (user: UserData, activityId: string): Promise<void> => {
        const activityLog = `Activity ${activityId}`
        const eventId = `activity-${activityId}`

        try {
            const cachedFiles = await this.getCachedFilesForUser(user)

            // Get and iterate only the cached events files (.json extensions, won't touch the actual .ics files for now).
            for (let file of cachedFiles) {
                try {
                    const buffer = await file.download()
                    if (!buffer) {
                        logger.debug("Calendar.onDeleteActivity", logHelper.user(user), activityLog, `No data for ${file.name}`)
                        continue
                    }

                    const data = buffer.toString()

                    // Update files depending on the extension (cached events as JSON, or calendar output as ICS).
                    if (file.name.endsWith(".json")) {
                        const cachedEvents = JSON.parse(data)

                        // Found a matching activity on the cache? Delete and save the file back.
                        if (cachedEvents[eventId]) {
                            delete cachedEvents[eventId]
                            await storage.setFile("calendar", file.name, JSON.stringify(cachedEvents, null, 2), "application/json")
                            logger.info("Calendar.onDeleteActivity", logHelper.user(user), activityLog, `Deleted from ${file.name}`)
                        }
                    } else if (file.name.endsWith(".ics")) {
                        const updatedIcs = await this.removeEventFromIcs(data, eventId)

                        // Found a matching activity on the ICS output? Delete and save the file back.
                        if (updatedIcs) {
                            await storage.setFile("calendar", file.name, updatedIcs, "text/calendar")
                            logger.info("Calendar.onDeleteActivity", logHelper.user(user), activityLog, `Deleted from ${file.name}`)
                        }
                    }
                } catch (fileEx) {
                    logger.error("Calendar.onDeleteActivity", logHelper.user(user), activityLog, file.name, fileEx)
                }
            }
        } catch (ex) {
            logger.error("Strava.onDeleteActivity", logHelper.user(user), activityLog, ex)
        }
    }

    /**
     * PRO users will have their calendars marked for update as soon as a new activity is processed.
     * @param user The user.
     * @param activityId The Strava activity.
     */
    private onProcessActivity = async (user: UserData, activity: StravaActivity): Promise<void> => {
        try {
            if (!user.isPro || activity.batch) {
                return
            }

            const calendars = await this.getForUser(user, {activities: true})
            if (calendars.length > 0) {
                calendars.forEach(async (cal) => await database.merge("calendars", {id: cal.id, pendingUpdate: true}))
                logger.info("Strava.onProcessActivity", logHelper.user(user), logHelper.activity(activity), `${calendars.length} calendars set as pending update`)
            }
        } catch (ex) {
            logger.error("Strava.onProcessActivity", logHelper.user(user), logHelper.activity(activity), ex)
        }
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
            if (dbCalendar?.options) {
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
                delete dbCalendar.dateAccess
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
                    if (dbCalendar.pendingUpdate) {
                        logger.info("Calendar.get", logHelper.user(user), optionsLog, "Calendar is pending update")
                    } else {
                        logger.info("Calendar.get", logHelper.user(user), optionsLog, "Cache invalidated, calendar marked for update")
                    }
                    dbCalendar.pendingUpdate = true
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
     * @param filterOptions Optional, get only calendars that match the passed options.
     */
    getForUser = async (user: UserData, filterOptions?: CalendarOptions): Promise<CalendarData[]> => {
        try {
            const where = [["userId", "==", user.id]]
            if (filterOptions) {
                for (let key in filterOptions) {
                    where.push([`options.${key}`, "==", filterOptions[key]])
                }
            }

            const result = await database.search("calendars", where)
            logger.info("Calendar.getForUser", logHelper.user(user), `Got ${result.length || "no"} calendars`)
            return result
        } catch (ex) {
            logger.error("Calendar.getForUser", logHelper.user(user), ex)
            throw ex
        }
    }

    /**
     * Get the cached calendar files for the specified user.
     * @param user The user.
     */
    getCachedFilesForUser = async (user: UserData): Promise<File[]> => {
        try {
            const calendarFiles = await storage.listFiles("calendar", `${user.id}/`)
            logger.info("Calendar.getCachedFilesForUser", logHelper.user(user), `Got ${calendarFiles.length || "no"} files from storage`)
            return calendarFiles
        } catch (ex) {
            logger.error("Calendar.getCachedFilesForUser", logHelper.user(user), ex)
        }
    }

    /**
     * Delete calendars for the specified user.
     * @param user User to have the calendars deleted.
     * @param includeCachedEvents If true, will also delete cached event details (start and end dates).
     */
    deleteForUser = async (user: UserData): Promise<number> => {
        let dbCount = 0
        let fileCount = 0

        // First delete calendars from the database.
        try {
            dbCount = await database.delete("calendars", ["userId", "==", user.id])
        } catch (ex) {
            logger.error("Calendar.deleteForUser", logHelper.user(user), "From database", ex)
        }

        // Then the .ics files from the calendar storage bucket.
        try {
            const calendarFiles = await this.getCachedFilesForUser(user)
            for (let file of calendarFiles) {
                const filename = file.name
                try {
                    await file.delete()
                    fileCount++
                    logger.info("Calendar.deleteForUser", logHelper.user(user), filename)
                } catch (fileEx) {
                    logger.error("Calendar.deleteForUser", logHelper.user(user), filename, fileEx)
                }
            }
        } catch (ex) {
            logger.error("Calendar.deleteForUser", logHelper.user(user), "From storage", ex)
        }

        if (dbCount > 0 || fileCount > 0) {
            logger.info("Calendar.deleteForUser", logHelper.user(user), `Deleted ${dbCount} from database and ${fileCount} from storage`)
        } else {
            logger.debug("Calendar.deleteForUser", logHelper.user(user), "Nothing deleted")
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

    // GENERATION AND PARSING
    // --------------------------------------------------------------------------

    /**
     * Build the .ics output and save to the calendar storage bucket.
     * @param user The user requesting the calendar.
     * @param dbCalendar The calendar data, including options.
     */
    generate = async (user: UserData, dbCalendar: CalendarData): Promise<string> => {
        const optionsLog = _.map(_.toPairs(dbCalendar.options), (r) => r.join("=")).join(" | ")

        try {
            const fileId = `${user.id}/${dbCalendar.id}`
            const cachedFile = await storage.getFile("calendar", `${fileId}.json`)

            // Check if the calendar is already being built. If that's the case,
            // wait till it finishes (or times out) and return the URL directly.
            const buildingTimestamp = this.building[dbCalendar.id]
            if (buildingTimestamp) {
                logger.warn("Calendar.generate", logHelper.user(user), optionsLog, `Already building: ${dbCalendar.id}`)

                const maxDate = dayjs(buildingTimestamp).add(settings.axios.timeout / 2, "seconds")
                while (this.building[dbCalendar.id] && maxDate.isAfter(new Date())) {
                    await jaul.io.sleep(settings.axios.backoffInterval)
                }

                return storage.getUrl("calendar", `${fileId}.ics`)
            }

            this.building[dbCalendar.id] = new Date()

            // Parse cached events from file, if there's one.
            let cachedEvents
            if (cachedFile) {
                const fileData = await cachedFile.download()
                cachedEvents = fileData ? JSON.parse(fileData.toString()) : null
            }

            // Build the calendar.
            const result = await calendarGenerator.build(user, dbCalendar, cachedEvents)
            if (result?.ics) {
                logger.debug("Calendar.generate", logHelper.user(user), optionsLog, "Ready to save")

                // First we save the cache files.
                try {
                    await storage.setFile("calendar", `${fileId}.ics`, result.ics, "text/calendar")
                    if (result.events) {
                        await storage.setFile("calendar", `${fileId}.json`, result.events, "application/json")
                    }
                } catch (cacheEx) {
                    logger.error("Calendar.generate", logHelper.user(user), optionsLog, "Failed to save cache files", cacheEx)
                }

                // Then we update the calendar record in the database.
                dbCalendar.dateUpdated = new Date()
                await database.merge("calendars", dbCalendar)

                logger.info("Calendar.generate", logHelper.user(user), optionsLog, `Saved: ${dbCalendar.id}.ics`)
                return storage.getUrl("calendar", `${fileId}.ics`)
            }

            // Something failed, stop here.
            throw new Error("Calendar output is empty")
        } catch (ex) {
            logger.error("Calendar.generate", logHelper.user(user), optionsLog, ex)
            throw ex
        } finally {
            delete this.building[dbCalendar.id]
        }
    }

    /**
     * Remove the specified event from the calendar and returns the updated output.
     * If nothing was removed, returns null.
     * @param ics The calendar ICS string.
     * @param eventId The calendar event UID.
     */
    removeEventFromIcs = (ics: string, uid: string): string => {
        const arrLog = [`Event ${uid}`]

        try {
            const urlPos = ics.indexOf("URL:")
            if (urlPos) {
                const calendarUrl = ics.substring(urlPos + 4, ics.indexOf("\n", urlPos)).trim()
                arrLog.unshift(calendarUrl)
            }

            // Find the position of the event UID first.
            const pos = ics.indexOf(`UID:${uid}`)
            if (!pos) {
                logger.debug("Calendar.removeEventFromIcs", arrLog.join(" | "), "Not found")
                return
            }

            // Find the BEGIN:VEVENT and END:VEVENT blocks and remove the event from the ICS string.
            const firstHalf = ics.substring(0, pos)
            const begin = firstHalf.lastIndexOf("BEGIN:VEVENT")
            const end = ics.indexOf("END:VEVENT", begin)

            logger.info("Calendar.removeEventFromIcs", arrLog.join(" | "), "Removed")
            return ics.substring(0, begin) + ics.substring(end + 10)
        } catch (ex) {
            logger.error("Calendar.removeEventFromIcs", arrLog.join(" | "), ex)
        }
    }
}

// Exports...
export default Calendar.Instance
