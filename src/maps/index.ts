// Strautomator Core: Maps

import {AddressType, Client, GeocodeRequest, GeocodeResult, ReverseGeocodeRequest} from "@googlemaps/google-maps-services-js"
import {emojiFlag, iso1A2Code} from "@rapideditor/country-coder"
import {Polyline} from "./polyline"
import {MapAddress, MapCoordinates} from "./types"
import {axiosRequest} from "../axios"
import Bottleneck from "bottleneck"
import database from "../database"
import cache from "bitecache"
import jaul from "jaul"
import logger from "anyhow"
import dayjs from "../dayjs"
import _ from "lodash"
const axios = require("axios").default
const settings = require("setmeup").settings
const packageVersion = require("../../package.json").version

/**
 * Google Maps wrapper.
 */
export class Maps {
    private constructor() {}
    private static _instance: Maps
    static get Instance() {
        return this._instance || (this._instance = new this())
    }

    /**
     * Google Maps and geocoding client.
     */
    private googleClient: Client = null

    /**
     * LocationIQ limiter module.
     */
    private lociqLimiter: Bottleneck

    /**
     * Polyline processor.
     */
    polylines: Polyline = Polyline.Instance

    // INIT
    // --------------------------------------------------------------------------

    /**
     * Init the Google Maps wrapper.
     */
    init = async (): Promise<void> => {
        try {
            if (!settings.maps.api.key) {
                throw new Error("Missing the mandatory maps.api.key setting")
            }

            // LocationIQ is optional.
            if (!settings.locationiq.token) {
                logger.warn("Maps.init", "Missing the LocationIQ token, locationiq provider will not work")
            } else {
                this.lociqLimiter = new Bottleneck({
                    maxConcurrent: settings.locationiq.maxConcurrent,
                    reservoir: settings.locationiq.maxPerMinute,
                    reservoirRefreshAmount: settings.locationiq.maxPerMinute,
                    reservoirRefreshInterval: 1000 * 60,
                    minTime: 500
                })

                // Rate limiter events.
                this.lociqLimiter.on("error", (err) => logger.error("LocationIQ.limiter", err))
                this.lociqLimiter.on("depleted", () => logger.warn("LocationIQ.limiter", "Rate limited"))
            }

            this.googleClient = new Client()

            cache.setup("maps", settings.maps.cacheDuration)
            logger.info("Maps.init", `Default style: ${settings.maps.defaultStyle}`, `Size ${settings.maps.defaultSize}`, `Zoom ${settings.maps.defaultZoom}`)
        } catch (ex) {
            logger.error("Maps.init", ex)
            throw ex
        }
    }

    // GEOCODING
    // --------------------------------------------------------------------------

    /**
     * Get the geocode data for the specified address.
     * @param address Address to query the coordinates for.
     * @param region Optional TLD biasing region.
     * @param provider Optional provider, defaults to Google.
     */
    getGeocode = async (address: string, region?: string, provider?: "google" | "locationiq"): Promise<MapCoordinates[]> => {
        if (!provider) provider = "google"

        try {
            if (!address || address.length < 3) {
                throw new Error("Invalid or missing address")
            }

            // Sanitize address and get its ID.
            address = jaul.data.removeFromString(decodeURIComponent(address), ["%", "{", "}", "[", "]", "(", ")", "@"])
            const addressId = address.toLowerCase().replace(/ /g, "")

            // Adapt region to correct ccTLD.
            if (region == "gb") {
                region = "uk"
            }

            // Location stored on cache?
            const cached = cache.get("maps", `${region || "global"}-${addressId}`)
            if (cached) {
                logger.debug("Maps.getGeocode.fromCache", address, region, `${cached.length} results`)
                return cached
            }

            // Get geocoded result from the specified provider.
            const results = provider == "google" ? await this.getGeocode_Google(address, region) : await this.getGeocode_LocationIQ(address, region)
            if (results) {
                cache.set("maps", `${region}-${addressId}`, results)
                logger.info("Maps.getGeocode", provider, address, region, `${results.length} result(s)`)
                return results
            }

            logger.info("Maps.getGeocode", provider, address, region, `No results`)
            return []
        } catch (ex) {
            const dmsCoordinates = this.dmsToCoordinates(address)

            // Location passed as DMS?
            if (dmsCoordinates) {
                logger.info("Maps.getGeocode", provider, address, `DMS converted to ${dmsCoordinates.latitude}, ${dmsCoordinates.longitude}`)
                return [dmsCoordinates]
            }

            logger.error("Maps.getGeocode", provider, address, region, ex)
            throw ex
        }
    }

    /**
     * Get the geocode data using Google.
     * @param address Address to query the coordinates for.
     * @param region Optional TLD biasing region.
     */
    private getGeocode_Google = async (address: string, region?: string): Promise<MapCoordinates[]> => {
        try {
            const geoRequest: GeocodeRequest = {
                params: {
                    address: address,
                    key: settings.maps.api.key
                }
            }

            // A region was specified? Append to the request parameters.
            if (region) {
                region = region.toLowerCase()
                geoRequest.params.region = region
            }

            // Get geocode from Google Maps.
            const res = await this.googleClient.geocode(geoRequest)
            if (res.data && res.data.results && res.data.results.length > 0) {
                return res.data.results.map((r) => {
                    return {
                        address: r.formatted_address,
                        latitude: r.geometry.location.lat,
                        longitude: r.geometry.location.lng,
                        placeId: r.place_id
                    }
                })
            }

            // Error returned by the Maps API?
            if (res.data?.error_message) {
                throw new Error(res.data.error_message)
            }

            // No results?
            return []
        } catch (ex) {
            logger.debug("Maps.getGeocode_Google", address, region, ex)
            throw ex
        }
    }

    /**
     * Get the geocode data using LocationIQ.
     * @param address Address to query the coordinates for.
     * @param region Optional TLD biasing region.
     */
    private getGeocode_LocationIQ = async (address: string, region?: string): Promise<MapCoordinates[]> => {
        try {
            if (region && address.indexOf(region) < address.length / 1.2) {
                address = `${address} ${region}`
            }

            const baseUrl = settings.locationiq.baseUrl
            const token = settings.locationiq.token
            const options: any = {
                method: "GET",
                returnResponse: true,
                url: `${baseUrl}search?zoom=14&format=json&key=${token}&q=${address}`,
                headers: {"User-Agent": `${settings.app.title} / ${packageVersion}`}
            }

            // Fetch geocode result from LocationIQ.
            const res: any = await this.lociqLimiter.schedule({id: address.replace(/\s/g, "")}, () => axiosRequest(options))
            if (res.data && res.data.length > 0) {
                return res.data.map((a) => {
                    return {
                        address: a.display_name,
                        latitude: parseFloat(a.lat),
                        longitude: parseFloat(a.lon),
                        placeId: a.place_id
                    }
                })
            }

            // No results?
            return []
        } catch (ex) {
            logger.debug("Maps.getGeocode_LocationIQ", address, region, ex)
            throw ex
        }
    }

    /**
     * Get the reverse geocode data for the specified coordinates.
     * @param coordinates Lat / long coordinates to be queried.
     * @param provider The geocoding provider, defaults to Google if omitted.
     */
    getReverseGeocode = async (coordinates: [number, number], provider?: "google" | "locationiq"): Promise<MapAddress> => {
        if (!provider) provider = "google"

        try {
            if (!coordinates || coordinates.length != 2) {
                throw new Error("Invalid or missing coordinates")
            }

            const now = dayjs()

            // Cache coordinates with a precision of 1km.
            const cacheId = `reverse-${provider}-${coordinates.map((c) => (Math.round(c * 100) / 100).toFixed(settings.maps.cachePrecision)).join("-")}`
            const logCoordinates = coordinates.join(", ")

            // Location cached in memory?
            const memCached = cache.get("maps", cacheId)
            if (memCached) {
                logger.debug("Maps.getReverseGeocode.fromCache", logCoordinates, this.getAddressLog(memCached, true))
                return memCached
            }

            // Location cached in the database?
            const dbCached: MapAddress = await database.get("maps", cacheId)
            if (dbCached && dayjs(dbCached.dateCached).isAfter(now.subtract(settings.maps.maxCacheDuration, "seconds"))) {
                logger.debug("Maps.getReverseGeocode.fromCache", logCoordinates, this.getAddressLog(dbCached, true))
                return dbCached
            }

            // Get address from the specified provider.
            const address: MapAddress = provider == "google" ? await this.getReverseGeocode_Google(coordinates) : await this.getReverseGeocode_LocationIQ(coordinates)
            if (address) {
                address.dateCached = now.toDate()
                address.dateExpiry = now.add(settings.maps.maxCacheDuration, "seconds").toDate()

                cache.set("maps", cacheId, address)
                database.set("maps", address, cacheId)

                logger.info("Maps.getReverseGeocode", provider, coordinates.join(", "), this.getAddressLog(address))
                return address
            }

            logger.info("Maps.getReverseGeocode", provider, `No results for ${coordinates.join(", ")}`)
            return null
        } catch (ex) {
            logger.error("Maps.getReverseGeocode", provider, coordinates, ex)
            throw ex
        }
    }

    /**
     * Get the reverse geocode data using Google.
     * @param coordinates Lat / long coordinates to be queried.
     */
    private getReverseGeocode_Google = async (coordinates: [number, number]): Promise<MapAddress> => {
        try {
            const geoRequest: ReverseGeocodeRequest = {
                params: {
                    latlng: coordinates,
                    key: settings.maps.api.key
                }
            }

            // Fetch geocode result from Google.
            const res = await this.googleClient.reverseGeocode(geoRequest)
            if (res?.data?.results?.length > 0) {
                let result: GeocodeResult
                result = res.data.results.find((r) => r?.address_components?.find((c) => c.types.includes(AddressType.locality)))
                if (!result) {
                    result = res.data.results.find((r) => r?.address_components?.find((c) => c.types.includes(AddressType.administrative_area_level_2)))
                }
                const components = result ? result.address_components : null
                if (!components) {
                    logger.warn("Maps.getReverseGeocode_Google", coordinates.join(", "), "Address not found")
                    return null
                }

                // Get relevant address components.
                const neighborhood = components.find((c) => c.types.includes(AddressType.neighborhood || AddressType.sublocality))
                const city = components.find((c) => c.types.includes(AddressType.locality) || c.types.includes(AddressType.administrative_area_level_2))
                const state = components.find((c) => c.types.includes(AddressType.administrative_area_level_1))
                const country = components.find((c) => c.types.includes(AddressType.country))

                // Build the resulting MapAddress.
                const address: MapAddress = {}
                if (neighborhood) address.neighborhood = neighborhood.long_name
                if (city) address.city = city.long_name
                if (state) address.state = state.long_name
                if (country) address.country = country.long_name

                return address
            }

            // Error returned by the Maps API?
            if (res.data && res.data.error_message) {
                throw new Error(res.data.error_message)
            }

            return null
        } catch (ex) {
            logger.debug("Maps.getReverseGeocode_Google", coordinates.join(", "), "Failed", ex)
            throw ex
        }
    }

    /**
     * Get the reverse geocode data using LocationIQ.
     * @param coordinates Lat / long coordinates to be queried.
     */
    private getReverseGeocode_LocationIQ = async (coordinates: [number, number]): Promise<MapAddress> => {
        try {
            const baseUrl = settings.locationiq.baseUrl
            const token = settings.locationiq.token

            const options: any = {
                method: "GET",
                returnResponse: true,
                url: `${baseUrl}reverse?zoom=14&format=json&key=${token}&lat=${coordinates[0]}&lon=${coordinates[1]}`,
                headers: {"User-Agent": `${settings.app.title} / ${packageVersion}`}
            }

            // Fetch geocode result from LocationIQ.
            const res: any = await this.lociqLimiter.schedule({id: coordinates.join("-")}, () => axiosRequest(options))
            if (res?.data?.address) {
                const addressInfo = res.data.address
                const address: MapAddress = {}

                // Append only the available / relevant data.
                if (addressInfo.neighbourhood) address.neighborhood = addressInfo.neighbourhood
                else if (addressInfo.suburb) address.neighborhood = addressInfo.suburb
                if (addressInfo.city) address.city = addressInfo.city
                else if (addressInfo.town) address.city = addressInfo.town
                else if (addressInfo.village) address.city = addressInfo.village
                else if (addressInfo.county) address.city = addressInfo.county
                if (addressInfo.state) address.state = addressInfo.state
                else if (addressInfo.state_district) address.state = addressInfo.state_district
                else if (addressInfo.county) address.state = addressInfo.county
                if (addressInfo.country) address.country = addressInfo.country

                return address
            }

            return null
        } catch (ex) {
            logger.debug("Maps.getReverseGeocode_LocationIQ", coordinates.join(", "), "Failed", ex)
            throw ex
        }
    }

    // IMAGES
    // --------------------------------------------------------------------------

    /**
     * Download a static PNG image representing a map for the specified coordinates.
     * @param coordinates The coordinates to get an image for.
     */
    getStaticImage = async (coordinates: MapCoordinates, options?: any): Promise<Buffer> => {
        try {
            if (!options) {
                options = {}
            }
            if (!options.style) {
                options.style = settings.maps.defaultStyle
            }
            if (!options.size) {
                options.size = settings.maps.defaultSize
            }
            if (!options.zoom) {
                options.zoom = settings.maps.defaultZoom
            }

            // Build parameters and URL.
            const key = `key=${settings.maps.api.key}`
            const center = `center=${coordinates.latitude},${coordinates.longitude}`
            const size = `size=${options.size}x${options.size}`
            const zoom = `zoom=${options.zoom}`
            const markers = `markers=${options.style}|${coordinates.latitude},${coordinates.longitude}`
            let url = `${settings.maps.api.baseStaticUrl}${key}&${center}&${size}&${zoom}&${markers}`

            // Specified a circle radius? Add a circle to the map.
            if (options.circle) {
                const circle = this.getCircleString(coordinates, options.circle)
                url += `&${circle}`
            } else {
                options.circle = "none"
            }

            // Download static image from Google Maps.
            const res: any = await axios.get(url, {responseType: "arraybuffer"})
            const image = Buffer.from(res.data, "binary")

            logger.info("Maps.getStaticImage", Object.values(coordinates).join(", "), `Size ${options.size}`, `Circle ${options.circle}`)
            return image
        } catch (ex) {
            logger.error("Maps.getStaticImage", Object.values(coordinates).join(", "), `Size ${options.size}`, `Circle ${options.circle}`, ex)
        }
    }

    // COUNTRIES
    // --------------------------------------------------------------------------

    /**
     * Get the 2 letter code (uppercased) for the specified country.
     * @param countryName The full country name or coordinates.
     */
    getCountryCode = (value: string | [number, number]): string => {
        if (!value) return ""

        // The library expects longitude first, then latitude.
        if (_.isArray(value)) {
            value = [value[1], value[0]]
        }

        return iso1A2Code(value, {level: "territory"})
    }

    /**
     * Get the emoji country flag for the specified country.
     * @param countryName The full country name or coordinates.
     */
    getCountryFlag = (value: string | [number, number]): string => {
        if (!value) return ""

        // The library expects longitude first, then latitude.
        if (_.isArray(value)) {
            value = [value[1], value[0]]
        }

        return emojiFlag(value, {level: "territory"})
    }

    // CLEANUP
    // --------------------------------------------------------------------------

    /**
     * Delete cached geolocation data from the database.
     * @param all If true, all cached data will be deleted, otherwise just the older ones.
     */
    cleanup = async (all?: boolean): Promise<void> => {
        const since = dayjs().subtract(settings.maps.maxCacheDuration, "seconds")
        const sinceLog = all ? "All" : `Since ${since.format("lll")}`

        try {
            const where: any[] = [["dateCached", "<", since.toDate()]]
            const count = await database.delete("maps", where)

            logger.info("Maps.cleanup", sinceLog, `${count || "Nothing"} deleted`)
        } catch (ex) {
            logger.error("Maps.cleanup", sinceLog, ex)
        }
    }

    // HELPERS
    // --------------------------------------------------------------------------

    /**
     * Convert degrees / minutes / seconds to decimal coordinates.
     * @param dms Coordinates in degrees / minutes / seconds format.
     */
    private dmsToCoordinates = (dms: string): MapCoordinates => {
        try {
            if (!dms || dms.length < 14 || dms.length > 40 || (!dms.includes("°") && !dms.includes("'") && !dms.includes('"'))) {
                return null
            }

            let parts = dms.trim().match(/[-]{0,1}[\d.]*[\d]|([NSEW])+/g)
            if (parts.length < 8 || isNaN(parts[0] as any) || isNaN(parts[4] as any)) {
                return null
            }

            // Internal value convertor.
            const convert = (d: number, m: number, s: number, c: string): number => {
                let result = parseFloat((d + m / 60 + s / 3600).toFixed(5))
                c = c.toUpperCase()
                return c == "S" || c == "W" ? -result : result
            }

            // Make sure lat and long are within the valid range.
            const lat = convert(parseInt(parts[0]), parseInt(parts[1]), parseInt(parts[2]), parts[3])
            const long = convert(parseInt(parts[4]), parseInt(parts[5]), parseInt(parts[6]), parts[7])
            if (lat > 90 || lat < -90 || long > 180 || long < -180) {
                return null
            }

            return {
                address: `Coordinates ${lat}, ${long}`,
                latitude: lat,
                longitude: long
            }
        } catch (ex) {
            logger.error("Maps.dmsToCoordinates", dms, ex)
            return null
        }
    }

    /**
     * Return the log string for the supplied address.
     * @param address The address data.
     * @param fromCache If coming from the cache, also log the cache date.
     */
    private getAddressLog = (address: MapAddress, fromCache?: boolean): string => {
        const result: string[] = []

        if (address.neighborhood) result.push(address.neighborhood)
        if (address.city) result.push(address.city)
        if (address.country) result.push(address.country)

        if (fromCache && address.dateCached) {
            result.push(`Cached ${dayjs(address.dateCached).format("lll")}`)
        }

        return result.join(", ")
    }

    /**
     * Return a path string representing a circle to be draw on a static map image.
     * @param coordinates The center coordinates.
     * @param radius The circle radius.
     */
    private getCircleString = (coordinates: MapCoordinates, radius: number): string => {
        const detail = 8
        const r = 6371
        const pi = Math.PI
        let latAux = (coordinates.latitude * pi) / 180
        let longAux = (coordinates.longitude * pi) / 180
        let d = radius / 1000 / r

        let result = `path=color:${settings.maps.circleColor}EE|fillcolor:${settings.maps.circleColor}55|weight:1`

        for (let i = 0; i <= 360; i += detail) {
            var brng = (i * pi) / 180

            var pLat = Math.asin(Math.sin(latAux) * Math.cos(d) + Math.cos(latAux) * Math.sin(d) * Math.cos(brng))
            var pLng = ((longAux + Math.atan2(Math.sin(brng) * Math.sin(d) * Math.cos(latAux), Math.cos(d) - Math.sin(latAux) * Math.sin(pLat))) * 180) / pi
            pLat = (pLat * 180) / pi

            result += "|" + pLat + "," + pLng
        }

        return result
    }
}

// Exports...
export default Maps.Instance
