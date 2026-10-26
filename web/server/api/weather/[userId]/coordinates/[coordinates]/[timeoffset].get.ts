// Strautomator API: Weather coordinates

import {weather} from "strautomator-core"
import {defineEventHandler, getRouterParam} from "nuxt/server"
import {requestValidator} from "../../../../../utils/auth"
import dayjs from "../../../../../utils/dayjs"
import {renderError, renderJson} from "../../../../../utils/web"
import logger from "anyhow"

/**
 * Weather for the specified coordinates.
 */
export default defineEventHandler(async (event) => {
    try {
        const user = await requestValidator(event)
        const coordinatesParam = getRouterParam(event, "coordinates", {decode: true})
        if (!coordinatesParam) {
            return renderError(event, "Missing coordinates", 400)
        }

        const result = {}
        const now = dayjs().utcOffset(parseInt(getRouterParam(event, "timeoffset", {decode: true}) as string))
        const arrCoordinates = coordinatesParam
            .toString()
            .split(",")
            .map((c) => parseFloat(c)) as [number, number]

        for (let provider of weather.providers) {
            try {
                const summary = await weather.getLocationWeather({user: user, coordinates: arrCoordinates, dDate: now, provider: provider.name})
                result[provider.name] = summary
            } catch (innerEx) {
                logger.error("Routes.weather", event.req.method, event.url.pathname + event.url.search, `Provider: ${provider.name}`, innerEx)
            }
        }

        const response = renderJson(event, result)
        response.headers.set("Cache-Control", "public, max-age=300")
        return response
    } catch (ex) {
        return renderError(event, ex)
    }
})
