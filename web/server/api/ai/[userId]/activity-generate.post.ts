// Strautomator API: Generate activity AI text

import {ai, weather} from "strautomator-core"
import type {StravaActivity} from "strautomator-core"
import {defineEventHandler} from "nuxt/server"
import {requestValidator} from "../../../utils/auth"
import dayjs from "../../../utils/dayjs"
import {getBody, renderError, renderJson} from "../../../utils/web"
import logger from "anyhow"

const rateLimitFree: {[userId: string]: Date} = {}

/**
 * Get the AI generated name or description for the specified activity.
 */
export default defineEventHandler(async (event) => {
    try {
        const user = await requestValidator(event)
        const body = await getBody(event)
        if (!body || !body.activity || Object.keys(body.activity).length == 0) throw new Error("Missing activity details")

        const provider = body.provider
        const customPrompt = body.customPrompt

        const rateLimitId = `${user.id}-${provider}`
        if (!user.isPro && rateLimitFree[rateLimitId]) {
            const lastRequest = dayjs(rateLimitFree[rateLimitId])
            const nextRequest = lastRequest.add(10, "minutes")
            if (nextRequest.isAfter(dayjs())) {
                throw new Error("Only 1 test per provider allowed every 10 minutes.")
            }
        }

        const activity: StravaActivity = body.activity
        if (activity.dateStart) activity.dateStart = new Date(activity.dateStart)
        if (activity.dateEnd) activity.dateEnd = new Date(activity.dateEnd)

        const language = user.preferences.language
        user.preferences.language = "en"

        let activityWeather = null
        if (!activity.trainer && activity.locationStart) {
            try {
                activityWeather = await weather.getActivityWeather(user, activity, true)
            } catch (weatherEx) {
                logger.warn("Routes.strava", event.req.method, event.url.pathname + event.url.search, "Failed to get weather summary, will proceed without")
            }
        }

        const name = await ai.generateActivityName(user, {activity, customPrompt, provider, activityWeather})
        const description = await ai.generateActivityDescription(user, {activity, customPrompt, provider, activityWeather})
        user.preferences.language = language

        if (!user.isPro) {
            rateLimitFree[rateLimitId] = new Date()
        }

        return renderJson(event, {name, description})
    } catch (ex) {
        return renderError(event, ex, 400)
    }
})
