// Strautomator Core: Komoot

import {KomootRoute} from "./types"
import {UserData} from "../users/types"
import {axiosRequest} from "../axios"
import database from "../database"
import dayjs from "../dayjs"
import logger = require("anyhow")
const settings = require("setmeup").settings

/**
 * Komoot data scraper.
 */
export class Komoot {
    private constructor() {}
    private static _instance: Komoot
    static get Instance() {
        return this._instance || (this._instance = new this())
    }

    // INIT
    // --------------------------------------------------------------------------

    /**
     * Init the Komoot wrapper.
     */
    init = async (): Promise<void> => {
        if (settings.komoot.disabled) {
            logger.warn("Komoot.init", "Route parsing is disabled")
        } else {
            logger.warn("Komoot.init", "Route parsing enabled")
        }
    }

    /**
     * Make a request to the Komoot website.
     * @param path URL path.
     */
    private makeRequest = async (path: string): Promise<string> => {
        const options: any = {
            method: "GET",
            returnResponse: true,
            url: `${settings.komoot.baseUrl}${path}`,
            headers: {"User-Agent": settings.axios.uaBrowser},
            abortStatus: [403]
        }

        try {
            const res = await axiosRequest(options)
            return res ? res.data : null
        } catch (ex) {
            logger.error("Komoot.makeRequest", path, ex)
            throw ex
        }
    }

    // MAIN METHODS
    // --------------------------------------------------------------------------

    /**
     * Ge route details from Komoot. No exeception will be thrown if the URL is invalid.
     * @param user The user requesting the route details.
     * @param url The Komoot route URL.
     */
    getRoute = async (user: UserData, url: string): Promise<KomootRoute> => {
        try {
            if (!url || !url.includes("/tour/")) {
                throw new Error("Invalid tour URL")
            }

            const tourId: any = url.substring(url.indexOf("tour/")).split("/")[1].split("?")[0]

            if (isNaN(tourId)) {
                throw new Error("Invalid tour URL")
            }

            const now = dayjs()
            const multDistance = user.profile.units == "imperial" ? 0.621371 : 1

            // Check if route details are available in the database cache first.
            const fromCache = await database.get("komoot", tourId)
            if (fromCache && dayjs(fromCache.dateCached).add(settings.komoot.cacheDuration, "seconds").isAfter(now)) {
                logger.info("Komoot.getRoute.fromCache", tourId, `Distance: ${fromCache.distance}km`, `Duration: ${fromCache.estimatedTime}s`)
                return fromCache
            }

            // Check if the tour was recently cached
            const result: KomootRoute = {
                id: tourId,
                dateCached: now.toDate(),
                dateExpiry: now.add(settings.komoot.cacheDuration, "seconds").toDate()
            }

            const html = await this.makeRequest(`tour/${tourId}`)
            if (!html) {
                logger.warn("Komoot.getRoute", tourId, "Could not fetch route, likely is private")
                return null
            }

            // Try parsing the distance.
            const iDistance = html.indexOf("Distance: ") + 10
            if (iDistance > 10) {
                const distance = html.substring(iDistance, html.indexOf(" km", iDistance))
                result.distance = parseFloat(distance.trim()) * multDistance
                result.distance = parseFloat(result.distance.toFixed(1))
            }

            // Try parsing the duration.
            const iDuration = html.indexOf("Duration: ") + 10
            if (iDuration > 10) {
                const duration = html.substring(iDuration, html.indexOf(" h", iDuration))
                const arrDuration = duration.trim().split(":")
                result.estimatedTime = parseInt(arrDuration[0]) * 60 * 60 + parseInt(arrDuration[1]) * 60
            }

            await database.set("komoot", result, result.id)
            logger.info("Komoot.getRoute", tourId, `Distance: ${result.distance}km`, `Duration: ${result.estimatedTime}s`)

            return result
        } catch (ex) {
            logger.warn("Komoot.getRoute", url, ex)
            return null
        }
    }

    /**
     * Try extracting a Komoot route URL from the passed string. Returns null if nothing found.
     * @param data String where a Komoot URL should be extracted from.
     */
    extractRouteUrl = (data: string): string => {
        try {
            const index = data.indexOf("www.komoot.")
            if (index < 0) return null

            const separatorIndex = data.substring(index + 12, index + 100).search(/[\s\n]/g)
            const url = data.substring(index, index + separatorIndex + 12)

            if (url.includes("/tour/")) {
                return url
            }

            return null
        } catch (ex) {
            logger.error("Komoot.extractRouteUrl", ex)
        }
    }
}

// Exports...
export default Komoot.Instance
