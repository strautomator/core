// Strautomator Functions: Calendar

import {CalendarData} from "strautomator-core"
import core = require("strautomator-core")
import logger from "anyhow"
import dayjs from "dayjs"
import _ from "lodash"
const settings = require("setmeup").settings

/**
 * Regenerate expired calendars.
 */
export const regenerate = async () => {
    logger.info("F.Calendar.regenerate.start")

    try {
        const processCalendar = async (calendar: CalendarData) => {
            const user = await core.users.getById(calendar.userId)

            // Stop here if user is suspended.
            if (user.suspended) {
                logger.debug("F.Calendar.regenerate", core.logHelper.user(user), `User is suspended, skipping calendar ${calendar.id}`)
                return
            }

            // Make sure Strava tokens are valid, to avoid triggering multiple refreshes when we are fetching
            // the user's clubs and activities to build the calendar.
            if (user.stravaTokens?.expiresAt <= dayjs().unix()) {
                user.stravaTokens = await core.strava.refreshToken(user.stravaTokens.refreshToken, user.stravaTokens.accessToken)
            }

            // Here we go!
            await core.calendar.generate(user, calendar)
        }

        // Fetch pending calendars and regenerate all of them, in small batches.
        const pendingCalendars = _.shuffle(await core.calendar.getPendingUpdate())
        const calendarCount = pendingCalendars.length
        while (pendingCalendars.length) {
            await Promise.allSettled(pendingCalendars.splice(0, settings.functions.batchSize).map(processCalendar))
        }

        logger.info("F.Calendar.regenerate", `Updated ${calendarCount || "no"} calendars`)
    } catch (ex) {
        logger.error("F.Calendar.regenerate", ex)
    }
}
