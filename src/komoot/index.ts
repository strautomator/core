// Strautomator Core: Komoot

import {KomootRoute, komootSportList} from "./types"
import {StravaSport} from "../strava/types"
import {UserData} from "../users/types"
import {axiosRequest} from "../axios"
import {URLSearchParams} from "url"
import database from "../database"
import maps from "../maps"
import routes from "../routes"
import dayjs from "../dayjs"
import _ from "lodash"
import cache from "bitecache"
import logger = require("anyhow")
import * as logHelper from "../loghelper"
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
        cache.setup("komoot-invalid", settings.komoot.cacheDuration)
        logger.info("Komoot.init", `Routes will be cached for up to ${dayjs.duration(settings.komoot.maxCacheDuration, "seconds").humanize()}`)
    }

    /**
     * Make a request to the Komoot website.
     * @param path URL path.
     */
    private makeRequest = async (url: string): Promise<any> => {
        const options: any = {
            method: "GET",
            returnResponse: true,
            url: url,
            headers: {"User-Agent": settings.axios.uaBrowser},
            abortStatus: [401, 403, 404]
        }

        try {
            const res = await axiosRequest(options)
            return res ? res.data : null
        } catch (ex) {
            logger.debug("Komoot.makeRequest", url, ex)
            throw ex
        }
    }

    // MAIN METHODS
    // --------------------------------------------------------------------------

    /**
     * Ge route details from Komoot. No exception will be thrown if the URL is invalid.
     * @param user The user requesting the route details.
     * @param routeUrl The Komoot route URL.
     */
    getRoute = async (user: UserData, routeUrl: string): Promise<KomootRoute> => {
        let fromCache: KomootRoute

        try {
            if (!routeUrl || !routeUrl.includes("/tour/")) {
                throw new Error("Invalid tour URL")
            }

            const now = dayjs()
            const tourId: any = routeUrl.substring(routeUrl.indexOf("tour/")).split("/")[1].split("?")[0]

            if (isNaN(tourId)) {
                throw new Error("Invalid tour URL")
            }

            // User preferences.
            const unit = user.profile.units == "imperial" ? "mi" : "km"
            const multDistance = user.profile.units == "imperial" ? 0.621371 : 1
            const multFeet = user.profile.units == "imperial" ? 3.28084 : 1

            // Check if that URL was previously unsuccessful.
            const invalidCache = cache.get("komoot-invalid", routeUrl)
            if (invalidCache) {
                logger.info("Komoot.getRoute", tourId || routeUrl, "Marked as invalid, won't fetch")
                return null
            }

            // Check if route details are available in the database cache first.
            fromCache = await database.get("komoot", tourId)
            if (fromCache && dayjs(fromCache.dateCached).add(settings.komoot.cacheDuration, "seconds").isAfter(now)) {
                logger.info("Komoot.getRoute.fromCache", tourId, `Distance: ${fromCache.distance}km`, `Duration: ${fromCache.totalTime}s`)
                return fromCache
            }

            const iQuery = routeUrl.indexOf("?")
            const query = iQuery > 0 ? routeUrl.substring(iQuery) : ""

            // Base result.
            const result: KomootRoute = {
                id: tourId,
                dateCached: now.toDate(),
                url: `${settings.komoot.baseUrl}tour/${tourId}${query}`
            }

            // Check if URL has a share token.
            if (query.includes("token")) {
                const params = new URLSearchParams(query)
                result.token = params.get("share_token") || params.get("token")
            }

            // First we try getting details from the API.
            await this.parseRouteFromApi(result)

            // If the expiration date is not set, it means it failed, so try from HTML.
            if (!result.dateExpiry) {
                await this.parseRouteFromHtml(result)
            }

            // Stop here if we don't have basic route details.
            if (!result.distance && !result.locationStart) {
                throw new Error(`Could not get details for tour ${result.id}`)
            }

            // Set the correct distance, elevation and moving time for the user.
            result.distance = (result.distance / 1000) * multDistance
            result.distance = parseFloat(result.distance.toFixed(1))
            result.elevationGain = Math.round((result.elevationGain || 0) * multFeet)
            result.movingTime = Math.round(result.movingTime * 0.99)

            // MTB routes are overly conservative, so remove some extra time.
            if (result.sportType == StravaSport.MountainBikeRide) {
                result.movingTime = Math.round(result.movingTime * 0.9)
            }

            // Process additional details.
            routes.process(user, result)

            // Save to database.
            await database.set("komoot", result, result.id)
            logger.info("Komoot.getRoute", logHelper.user(user), tourId, result.name, `Distance: ${result.distance || "?"} ${unit}`, `Duration: ${result.totalTime || "?"} s`)

            return result
        } catch (ex) {
            if (fromCache) {
                logger.error("Komoot.getRoute", logHelper.user(user), routeUrl, ex, "Will return cached data")
                return fromCache
            }

            logger.error("Komoot.getRoute", logHelper.user(user), routeUrl, ex)
            cache.set("komoot-invalid", routeUrl, true)
            return null
        }
    }

    /**
     * Parse the route details from the API.
     * @param route The Komoot route to be parsed.
     */
    parseRouteFromApi = async (route: KomootRoute): Promise<void> => {
        try {
            const baseUrl = `${settings.komoot.api.baseUrl}tours/${route.id}`
            const json = await this.makeRequest(route.token ? baseUrl + `?share_token=${route.token}` : baseUrl)
            if (!json) {
                throw new Error("Could not extract tour data from API")
            }

            // Basic route details.
            route.name = json.name
            route.distance = json.distance
            route.movingTime = json.duration
            route.elevationGain = json.elevation_up

            // Parse starting point and encode the coordinates, if present.
            if (json.start_point) {
                route.locationStart = [json.start_point.lat, json.start_point.lng]
            }

            // Now try fetching the coordinates.
            try {
                const coordinatesJson = await this.makeRequest(route.token ? baseUrl + `/coordinates?share_token=${route.token}` : baseUrl + "/coordinates")
                if (coordinatesJson) {
                    const midPath = coordinatesJson.items[Math.round(json.path.length / 2)]
                    const lastPath = coordinatesJson.items[json.path.length - 1]
                    route.locationMid = [midPath.lat, midPath.lng]
                    route.locationEnd = [lastPath.lat, lastPath.lng]
                    route.polyline = maps.polylines.encode(coordinatesJson.items.map((p) => [p.lat, p.lng]))
                }
            } catch (innerEx) {
                logger.error("Komoot.parseRouteFromApi", route.id, "Failed to fetch coordinates", innerEx)
            }

            // Add difficulty.
            if (json.difficulty) {
                route.difficulty = json.difficulty.grade
            }

            // Set sport type.
            route.sportType = komootSportList[json.sport] || StravaSport.Ride

            // Maximum expiration time.
            route.dateExpiry = dayjs().add(settings.komoot.maxCacheDuration, "seconds").toDate()
        } catch (ex) {
            if (ex.statusCode == 404) {
                logger.warn("Komoot.parseRouteFromApi", route.id, "Not found")
            } else {
                logger.error("Komoot.parseRouteFromApi", route.id, ex)
            }
        }
    }

    /**
     * Parse the route details from the web HTML view.
     * @param route The Komoot route to be parsed.
     */
    parseRouteFromHtml = async (route: KomootRoute): Promise<void> => {
        try {
            const html = await this.makeRequest(route.url)
            if (!html) {
                throw new Error("Could not extract tour data from HTML")
            }

            // Extract the route name from the title.
            const iTitle = html.indexOf("<title>") + 7
            const iTitleEnd = html.indexOf("</title>")
            const arrTitle = html.substring(iTitle, iTitleEnd).split("|")
            arrTitle.pop()
            route.name = arrTitle.join(" - ")

            // Try parsing the distance.
            const iDistance = html.indexOf("Distance: ") + 10
            if (iDistance > 10) {
                const distance = html.substring(iDistance, html.indexOf(" km", iDistance))
                route.distance = parseFloat(distance.trim())
            }

            // Try parsing the duration.
            const iDuration = html.indexOf("Duration: ") + 10
            if (iDuration > 10) {
                const htmlDuration = html.substring(iDuration, html.indexOf(" h", iDuration))
                const arrDuration = htmlDuration.trim().split(":")
                route.movingTime = parseInt(arrDuration[0]) * 60 * 60 + parseInt(arrDuration[1]) * 60
            }

            // Try parsing the start location.
            const startPoint = html.indexOf(`\\"start_point\\"`, html.length / 3)
            if (startPoint) {
                const iLat = html.indexOf(`\\"lat\\":`, startPoint) + 8
                const iLng = html.indexOf(`\\"lng\\":`, startPoint) + 8

                if (iLat > 6 && iLng > 6) {
                    const lat: any = html.substring(iLat, html.indexOf(`,`, iLat))
                    const lng: any = html.substring(iLng, html.indexOf(`,`, iLng))

                    if (!isNaN(lng) && !isNaN(lng)) {
                        route.locationStart = [parseFloat(lat), parseFloat(lng)]
                    }
                }
            }

            // Maximum expiration time.
            route.dateExpiry = dayjs().add(settings.komoot.maxCacheDuration, "seconds").toDate()
        } catch (ex) {
            if (ex.statusCode == 404) {
                logger.warn("Komoot.parseRouteFromHtml", route.id, "Not found")
            } else {
                logger.error("Komoot.parseRouteFromHtml", route.id, ex)
            }
        }
    }

    /**
     * Try extracting a Komoot route URL from the passed string. Returns null if nothing found.
     * @param data String where a Komoot tour URL should be extracted from.
     */
    extractRouteUrl = (data: string): string => {
        try {
            const index = data.indexOf("www.komoot.")
            if (index < 0) return null

            const baseString = data.substring(index + 12, index + 120)

            // Get the index of a new line, colon, space, or query reference, whatever comes first.
            const sepNewLine = baseString.indexOf("\n")
            const sepCol = baseString.indexOf(":")
            const sepPeriod = baseString.indexOf(".")
            const sepParen = baseString.indexOf(")")
            const sepSpace = baseString.indexOf(" ")
            const sepParty = baseString.indexOf("Party")
            const allSeparators = [sepNewLine, sepCol, sepPeriod, sepParen, sepSpace, sepParty]

            // Only consider the ref= as a separator in case it comes after the token in the query.
            const sepRef = baseString.indexOf("ref=")
            const sepToken = baseString.indexOf("token=")
            if (sepRef >= sepToken) {
                allSeparators.push(sepRef)
            }

            // Extract the URL according to the separator index.
            const separators = allSeparators.filter((s) => s > 0)
            const separatorIndex = separators.length > 0 ? _.min(separators) : 0
            const routeUrl = separatorIndex > 0 ? data.substring(index, index + separatorIndex + 12) : data.substring(index)

            // Make sure it does not have the trailing ? query symbol.
            if (routeUrl.includes("/tour/")) {
                const isLastQuery = routeUrl.substring(routeUrl.length - 1) == "?"
                return isLastQuery ? routeUrl.substring(0, routeUrl.length - 1).trim() : routeUrl.trim()
            }

            return null
        } catch (ex) {
            logger.error("Komoot.extractRouteUrl", ex)
        }
    }
}

// Exports...
export default Komoot.Instance
