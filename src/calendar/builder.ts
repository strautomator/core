// Strautomator Core: Calendar Builder

import ical, {ICalCalendarData} from "ical-generator"
import {FieldValue} from "@google-cloud/firestore"
import {CalendarCachedEvents, CalendarData, CalendarOutput} from "./types"
import {buildActivities} from "./builders/activities"
import {buildClubs} from "./builders/clubs"
import {buildGearWear} from "./builders/gearwear"
import {UserData} from "../users/types"
import _ from "lodash"
import logger from "anyhow"
import * as logHelper from "../loghelper"
import dayjs from "../dayjs"
const settings = require("setmeup").settings

/**
 * Wrapper to handle the calendar builders.
 */
export class CalendarBuilder {
    private constructor() {}
    private static _instance: CalendarBuilder
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
                prodId: {company: "Devv", language: "EN", product: settings.app.title},
                url: `${settings.app.url}calendar/${user.urlToken}`,
                ttl: user.isPro ? settings.plans.pro.calendarCacheDuration : settings.plans.free.calendarCacheDuration
            }
            const cal = ical(calData)

            // First time that the calendar is being built? Use a shorter date range
            // to speed things up. The correct ranges will be applied subsequently.
            const partialFirstBuild = !dbCalendar.dateAccess && settings.calendar.partialFirstBuild
            if (partialFirstBuild) {
                dbCalendar.options.daysFrom = Math.ceil(dbCalendar.options.daysFrom / 4)
                dbCalendar.options.daysTo = Math.ceil(dbCalendar.options.daysTo / 4)
                dbCalendar.pendingUpdate = true
            } else if (dbCalendar.pendingUpdate) {
                dbCalendar.pendingUpdate = FieldValue.delete() as any
            }

            logger.info("Calendar.build", logHelper.user(user), optionsLog, partialFirstBuild ? "Build starting for the first time" : "Build starting")

            // Build activities, clubs and gear according to the options.
            // Important: activities and clubs events will be cached in the storage bucket, as the data
            // comes from Strava, but gear history changes won't, as we control that data.
            dbCalendar.cacheCount = 0
            if (dbCalendar.options.activities) {
                dbCalendar.activityCount = 0
                await buildActivities(user, dbCalendar, cal, cachedEvents)
            }
            if (dbCalendar.options.clubs) {
                dbCalendar.clubEventCount = 0
                await buildClubs(user, dbCalendar, cal, cachedEvents)
            }
            if (dbCalendar.options.gear) {
                dbCalendar.gearEventCount = 0
                await buildGearWear(user, dbCalendar, cal)
            }

            const outputIcs = cal.toString()
            const duration = dayjs.utc().unix() - startTime
            const size = outputIcs.length / 1000 / 1024
            const eventCount = (dbCalendar.activityCount || 0) + (dbCalendar.clubEventCount || 0) + (dbCalendar.gearEventCount || 0)

            // Remove recent events from the cached config output.
            const minCacheDate = now.subtract(settings.calendar.minAgeForCachingDays, "days")
            const removed = _.remove(cal.events(), (e) => minCacheDate.isBefore(dayjs(e.start() as any))).length
            const uncachedCount = partialFirstBuild ? eventCount : removed + (dbCalendar.gearEventCount || 0)

            const countLog = `${eventCount} total events, ${uncachedCount} won't be cached`
            const sizeLog = `${size.toFixed(2)} MB`
            const timeLog = `Generated in ${duration} seconds`
            logger.info("Calendar.build", logHelper.user(user), optionsLog, countLog, sizeLog, timeLog)

            // If this is the first partial build, we don't want to cache anything yet.
            // Otherwise, exclude GearWear events, compact the cached events and map them
            // by ID, before returning the final result to be saved to the storage.
            if (partialFirstBuild) {
                return {ics: outputIcs}
            } else {
                const cacheableEvents = cal.toJSON().events.filter((e) => !e.id.startsWith("gear"))
                const compactEvents = cacheableEvents.map((e) => _.omitBy(e, (v) => _.isNil(v) || (_.isArray(v) && v.length == 0)))
                return {ics: outputIcs, events: JSON.stringify(_.keyBy(compactEvents, "id"), null, 0)}
            }
        } catch (ex) {
            logger.error("Calendar.build", logHelper.user(user), optionsLog, ex)
            throw ex
        }
    }
}

// Exports...
export default CalendarBuilder.Instance
