// Strautomator API: Get upcoming club events for the user

import {maps, strava} from "strautomator-core"
import {defineEventHandler, getQuery} from "nuxt/server"
import {requestValidator} from "../../../../utils/auth"
import {renderError, renderJson} from "../../../../utils/web"
import setmeup from "setmeup"
const settings = setmeup.settings

/**
 * Get upcoming club events for the user.
 */
export default defineEventHandler(async (event) => {
    try {
        const user = await requestValidator(event)
        const query = getQuery(event)

        const days = query.days ? parseInt(query.days as string) : user.isPro ? settings.plans.pro.futureCalendarDays : settings.plans.free.futureCalendarDays
        if (!user.isPro && days > settings.plans.free.futureCalendarDays) {
            throw new Error(`Free accounts are limited to ${settings.plans.free.futureCalendarDays} days in the future`)
        }

        const countries = [user.profile.country]

        if (query.coordinates) {
            const queryCoords = query.coordinates.toString()
            const coordinates = queryCoords.split(",").map((c) => parseFloat(c)) as [number, number]
            const address = await maps.getReverseGeocode(coordinates, "locationiq")
            if (address && address.country != user.profile.country) {
                countries.push(address.country)
            }
        }

        const events = await strava.clubs.getUpcomingClubEvents(user, days, countries)
        return renderJson(event, events)
    } catch (ex) {
        return renderError(event, ex)
    }
})
