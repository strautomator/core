// Strautomator API: Prepare and refresh athlete's personal records based on all Strava activities

import {strava} from "strautomator-core"
import {defineEventHandler} from "nuxt/server"
import {requestValidator} from "../../../../utils/auth"
import {renderError, renderJson} from "../../../../utils/web"
import dayjs from "../../../../utils/dayjs"
import logger from "anyhow"

/**
 * Prepare and refresh athlete's personal records based on all Strava activities.
 */
export default defineEventHandler(async (event) => {
    try {
        const user = await requestValidator(event)

        const existing = await strava.athletes.getAthleteRecords(user)
        const now = dayjs().utc().subtract(1, "second")
        const minDate = now.subtract(24, "hours")

        if (existing && minDate.isBefore(existing.dateRefreshed)) {
            logger.warn("Routes.strava", event.req.method, event.url.pathname + event.url.search, "Recently refreshed, will not proceed")
            return renderJson(event, {recentlyRefreshed: true})
        }

        await strava.athletes.prepareAthleteRecords(user)

        const dateFrom = dayjs("2000-01-01").utc()
        const dateTo = now

        const activities = await strava.activities.getActivities(user, {after: dateFrom, before: dateTo})
        const records = await strava.athletes.checkActivityRecords(user, activities)

        return renderJson(event, records)
    } catch (ex) {
        return renderError(event, ex)
    }
})
