// Strautomator API: Get logged user's activities from Strava since the specified timestamp

import {strava} from "strautomator-core"
import {defineEventHandler, getQuery} from "nuxt/server"
import {requestValidator} from "../../../../../utils/auth"
import {renderError, renderJson, getRequiredParam} from "../../../../../utils/web"
import dayjs from "../../../../../utils/dayjs"
import _ from "lodash"

/**
 * Get logged user's activities from Strava since the specified timestamp.
 */
export default defineEventHandler(async (event) => {
    try {
        const user = await requestValidator(event)
        const query = getQuery(event)
        const timestamp = getRequiredParam(event, "timestamp", "Missing timestamp")

        let dateFrom = dayjs.unix(parseInt(timestamp))
        const minDate = dayjs().subtract(731, "days")
        if (dateFrom.isBefore(minDate)) dateFrom = minDate

        const activities = await strava.activities.getActivities(user, {after: dateFrom})

        if (query.gear) {
            _.remove(activities, (a) => !a.gear || a.gear.id != query.gear)
        }

        return renderJson(event, activities)
    } catch (ex) {
        return renderError(event, ex)
    }
})
