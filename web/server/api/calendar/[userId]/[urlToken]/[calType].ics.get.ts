// Strautomator API: Strava calendar feed

import {calendar, users} from "strautomator-core"
import {defineEventHandler, getQuery, getRouterParam} from "nuxt/server"
import logger from "anyhow"
import setmeup from "setmeup"
const settings = setmeup.settings

/**
 * Return the Strava calendar for the specified user.
 */
export default defineEventHandler(async (event) => {
    try {
        const userId = getRouterParam(event, "userId", {decode: true})
        const urlToken = getRouterParam(event, "urlToken", {decode: true})
        const calType = getRouterParam(event, "calType", {decode: true})
        if (!userId || !urlToken || !calType) throw new Error("Missing request params")

        const user = await users.getById(userId)

        if (!["all", "activities", "clubs", "gear"].includes(calType)) throw new Error("Calendar not found")
        if (!user) throw new Error(`User ${userId} not found`)
        if (user.urlToken != urlToken) throw new Error("Calendar not found")

        const query = getQuery(event)
        const options: any = {
            activities: calType == "all" || calType == "activities",
            clubs: calType == "all" || calType == "clubs",
            gear: calType == "all" || calType == "gear"
        }

        if (query.commutes === "0") options.excludeCommutes = true
        if (query.joined === "1") options.excludeNotJoined = true
        if (query.countries === "1") options.includeAllCountries = true
        if (query.link === "1") options.linkInDescription = true
        if (query.compact === "1") options.compact = true
        if (query.sports?.toString().length > 1) options.sportTypes = query.sports.toString().split(",")
        if (query.clubs?.toString().length > 1) options.clubIds = query.clubs.toString().split(",")
        if (query.daysfrom) options.daysFrom = parseInt(query.daysfrom as string)
        if (query.daysto) options.daysTo = parseInt(query.daysto as string)
        if (query.fresher) options.fresher = true

        if (options.clubIds?.length > settings.calendar.maxItemsPerFilter) return new Response(`Too many clubs, max ${settings.calendar.maxItemsPerFilter}`, {status: 400})
        if (options.sportTypes?.length > settings.calendar.maxItemsPerFilter) return new Response(`Too many sports, max ${settings.calendar.maxItemsPerFilter}`, {status: 400})

        let cacheAge = user.isPro ? settings.plans.pro.calendarCacheDuration : settings.plans.free.calendarCacheDuration
        if (user.isPro && options.fresher) {
            cacheAge = Math.round(cacheAge * 0.4)
        } else {
            cacheAge = Math.round(cacheAge * 0.8)
        }

        const redirectUrl = await calendar.get(user, options)
        return new Response(null, {status: 302, headers: {"Content-Type": "text/calendar", "Cache-Control": `public, max-age=${cacheAge}`, Location: redirectUrl}})
    } catch (ex) {
        const message = ex.message || ex.toString()
        if (message.includes(" not found")) {
            logger.warn("Routes.calendar", event.req.method, event.url.pathname + event.url.search, "Not found")
            return new Response("Calendar not found", {status: 404})
        }

        logger.error("Routes.calendar", event.req.method, event.url.pathname + event.url.search, ex)
        return new Response("Failed to generate the calendar", {status: 500})
    }
})
