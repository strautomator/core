// Strautomator Core: Calendar

import {CalendarOptions} from "./types"
import {UserData} from "../users/types"
import strava from "../strava"
import ical = require("ical-generator")
import logger = require("anyhow")
import moment = require("moment")
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
            logger.info("Calendar.init")
        } catch (ex) {
            logger.error("Calendar.init", ex)
            throw ex
        }
    }

    // CALENDAR METHODS
    // --------------------------------------------------------------------------

    /**
     * Generate the activities calendar and return its iCal string representation.
     * @param user The user requesting the calendar.
     * @param options Calendar generation options.
     */
    generate = async (user: UserData, options: CalendarOptions): Promise<string> => {
        try {
            if (!options.sportTypes || options.sportTypes.length == 0) {
                options.sportTypes = null
            }

            const dateFrom = options.dateFrom ? options.dateFrom : moment().utc().subtract(settings.calendar.defaultDays, "days").toDate()
            const tsAfter = dateFrom.valueOf() / 1000
            const tsBefore = new Date().valueOf() / 1000

            // Validation checks.
            const minDate = moment().utc().subtract(settings.calendar.maxDays, "days")
            if (minDate.isAfter(dateFrom)) {
                throw new Error(`Minimum accepted "date from" for the calendar is ${minDate.format("L")} (${settings.calendar.maxDays} days)`)
            }

            // Set calendar name based on passed filters.
            let calName = settings.calendar.name
            if (options.sportTypes) calName += ` (${options.sportTypes.join(", ")})`

            // Prepare calendar details.
            const domain = settings.app.url.replace("http://", "").replace("https://", "").replace("/", "")
            const prodId = {company: "Devv", product: "Strautomator", language: "EN"}
            const calUrl = `${settings.app.url}calendar/${user.urlToken}`
            const cal = ical({domain: domain, name: calName, prodId: prodId, url: calUrl})

            // Get activities from Strava.
            const activities = await strava.activities.getActivities(user, {before: tsBefore, after: tsAfter})
            let counter = 0

            // Iterate activities from Strava.
            // If a sport type filter was passed, check it before proceeding.
            for (let a of activities) {
                const eventUrl = `https://www.strava.com/activities/${a.id}`

                // Check for sport types and commute filters.
                if (options.sportTypes && options.sportTypes.indexOf(a.type) < 0) continue
                if (options.excludeCommutes && a.commute) continue

                // Add activity to the calendar as an event.
                cal.createEvent({
                    uid: a.id,
                    start: a.dateStart,
                    end: a.dateEnd,
                    summary: a.name,
                    description: a.description,
                    url: eventUrl
                })

                counter++
            }

            logger.info("Calendar.generate", `User ${user.id} ${user.displayName}`, `Got ${counter} activities`)

            return cal.toString()
        } catch (ex) {
            logger.error("Calendar.generate", `User ${user.id} ${user.displayName}`, `From ${options.dateFrom}`, ex)
            throw ex
        }
    }
}

// Exports...
export default Calendar.Instance
