// Strautomator API: Update an athlete record manually

import {strava, StravaSport} from "strautomator-core"
import type {StravaAthleteRecords} from "strautomator-core"
import {defineEventHandler} from "nuxt/server"
import {requestValidator} from "../../../../utils/auth"
import {getBody, renderError, renderJson, getRequiredParam} from "../../../../utils/web"

/**
 * Update an athlete record manually.
 */
export default defineEventHandler(async (event) => {
    try {
        const user = await requestValidator(event)
        const body = await getBody(event)
        if (!body) throw new Error("Missing request body")

        const sportsList = Object.keys(StravaSport)
        const sport = getRequiredParam(event, "sport")
        const field = body.field as string
        const value = body.value
        const previous = body.previous

        if (!field) throw new Error("Missing record field")
        if (!value || isNaN(value)) throw new Error("Missing or invalid record value")
        if (!sportsList.includes(sport)) throw new Error("Invalid sport")

        const records: StravaAthleteRecords = {
            [sport as string]: {
                [field as string]: {
                    value: parseFloat(value),
                    activityId: null,
                    date: new Date()
                }
            }
        }

        if (previous && !isNaN(previous)) {
            records[sport as string][field as string].previous = previous
        }

        await strava.athletes.setAthleteRecords(user, records)
        return renderJson(event, records)
    } catch (ex) {
        return renderError(event, ex)
    }
})
