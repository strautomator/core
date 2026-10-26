// Strautomator API: Get logged user's recent activities from Strava

import {strava} from "strautomator-core"
import {defineEventHandler, getQuery} from "nuxt/server"
import {requestValidator} from "../../../../utils/auth"
import {renderError, renderJson} from "../../../../utils/web"
import dayjs from "../../../../utils/dayjs"

/**
 * Get logged user's recent activities from Strava.
 */
export default defineEventHandler(async (event) => {
    try {
        const user = await requestValidator(event)
        const query = getQuery(event)

        let limit: number = query.limit ? parseInt(query.limit as string) : 10
        if (!Number.isFinite(limit) || limit < 1) limit = 10
        if (limit > 50) limit = 50

        let dateFrom = query.since ? dayjs.unix(parseInt(query.since as string)) : dayjs().subtract(30, "days")
        const minDate = dayjs().subtract(60, "days")
        if (dateFrom.isBefore(minDate)) dateFrom = minDate

        let activities = await strava.activities.getActivities(user, {after: dateFrom})
        activities.reverse()

        if (activities.length > limit) {
            activities = activities.slice(0, limit)
        }

        return renderJson(event, activities)
    } catch (ex) {
        return renderError(event, ex)
    }
})
