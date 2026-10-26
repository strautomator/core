// Strautomator API: Logged user can trigger a batch processing of older activities

import {strava} from "strautomator-core"
import type {StravaActivityFilter} from "strautomator-core"
import {defineEventHandler} from "nuxt/server"
import {requestValidator} from "../../../utils/auth"
import {getBody, renderError, renderJson} from "../../../utils/web"
import dayjs from "../../../utils/dayjs"
import setmeup from "setmeup"
const settings = setmeup.settings

/**
 * Logged user can trigger a batch processing of older activities.
 */
export default defineEventHandler(async (event) => {
    try {
        const body = await getBody(event)
        if (!body) throw new Error("Missing request body")

        const user = await requestValidator(event)
        const dateFrom = body.dateFrom ? dayjs(body.dateFrom as string).utc() : null
        const dateTo = body.dateTo ? dayjs(body.dateTo as string).utc() : null
        const filterPrivacy = body.filterPrivacy ? body.filterPrivacy : "all"
        const filterSport = body.filterSport ? body.filterSport : "all"
        const filterType = body.filterType ? body.filterType : "all"

        if (!dateFrom || !dateFrom.isValid()) throw new Error(`Invalid "from" date`)
        if (!dateTo || !dateTo.isValid()) throw new Error(`Invalid "to" date`)

        if (user.dateLastBatchProcessing && dayjs().subtract(settings.strava.processingQueue.batchPerHours, "hours").isBefore(user.dateLastBatchProcessing)) {
            throw new Error(`Only a single batch operation allowed every ${settings.strava.processingQueue.batchPerHours} hour(s)`)
        }

        const filter: StravaActivityFilter = {}
        if (filterPrivacy == "private") filter.private = true
        else if (filterPrivacy == "public") filter.private = false
        if (filterType == "commute") filter.commute = true
        else if (filterType == "notCommute") filter.commute = false
        else if (filterType == "race") filter.race = true
        else if (filterType == "notRace") filter.race = false
        if (filterSport != "all") filter.sportType = filterSport

        const activityCount = await strava.activityProcessing.batchProcessActivities(user, dateFrom.startOf("day"), dateTo.endOf("day"), filter)

        await strava.activityProcessing.processQueuedActivities()

        return renderJson(event, {activityCount: activityCount, processed: activityCount <= settings.strava.processingQueue.batchSize})
    } catch (ex) {
        const errorMessage = ex.message || ex.toString()
        return renderError(event, ex, errorMessage.includes("single batch operation") ? 429 : 500)
    }
})
