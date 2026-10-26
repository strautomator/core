// Strautomator API: Weather multi forecast

import {weather} from "strautomator-core"
import {defineEventHandler, getQuery} from "nuxt/server"
import {requestValidator} from "../../../utils/auth"
import dayjs from "../../../utils/dayjs"
import {renderError, renderJson} from "../../../utils/web"
import logger from "anyhow"
import setmeup from "setmeup"
const settings = setmeup.settings

interface MultiForecastResult {
    id?: string | number
    coordinates?: [number, number]
    timestamp?: number
    forecast?: any
    error?: Error
}

/**
 * Weather forecast for the specified locations and dates.
 */
export default defineEventHandler(async (event) => {
    try {
        const user = await requestValidator(event, {referer: true})
        const query = getQuery(event)
        if (!query.data) {
            return renderError(event, "Missing request query", 400)
        }

        const provider = query.provider && settings.weather[query.provider.toString()] ? query.provider.toString() : null
        const arrQuery = query.data.toString().split("|")
        if (arrQuery.length > settings.weather.maxBatchSize) return renderError(event, `Too many forecast requests (${arrQuery.length}), max allowed: ${settings.weather.maxBatchSize}`, 400)

        const result: MultiForecastResult[] = []
        let hadError = false

        const getForecast = async (forecastQuery): Promise<void> => {
            let queryResult: MultiForecastResult = {}
            try {
                const arrData = forecastQuery.split(":")
                queryResult.id = arrData[0]
                queryResult.coordinates = arrData[1].split(",").map((c) => parseFloat(c)) as [number, number]
                queryResult.timestamp = parseInt(arrData[2])
                queryResult.forecast = await weather.getLocationWeather({user: user, coordinates: queryResult.coordinates, dDate: dayjs.unix(queryResult.timestamp), provider: provider})
            } catch (weatherEx) {
                logger.warn("Routes.weather", event.req.method, event.url.pathname + event.url.search, weatherEx.message)
                hadError = true
                queryResult.error = weatherEx
            } finally {
                result.push(queryResult)
            }
        }

        const batchSize = user.isPro ? settings.plans.pro.apiConcurrency : settings.plans.free.apiConcurrency
        while (arrQuery.length) {
            await Promise.allSettled(arrQuery.splice(0, batchSize).map(getForecast))
        }

        const response = renderJson(event, result)
        response.headers.set("Cache-Control", `public, max-age=${hadError ? "60" : "600"}`)
        return response
    } catch (ex) {
        return renderError(event, ex)
    }
})
