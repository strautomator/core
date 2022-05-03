// Strautomator Core: Maps

import {Client, GeocodeRequest, ReverseGeocodeRequest} from "@googlemaps/google-maps-services-js"
import {Polyline} from "./polyline"
import {MapAddress, MapCoordinates} from "./types"
import cache = require("bitecache")
import jaul = require("jaul")
import logger = require("anyhow")
const axios = require("axios").default
const settings = require("setmeup").settings

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
     * Google Maps client.
     */
    private client: Client = null

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

            this.client = new Client()

            cache.setup("maps", settings.maps.cacheDuration)
            logger.info("Maps.init", `Default style: ${settings.maps.defaultStyle}`, `Size ${settings.maps.defaultSize}`, `Zoom ${settings.maps.defaultZoom}`)
        } catch (ex) {
            logger.error("Maps.init", ex)
            throw ex
        }
    }

    // METHODS
    // --------------------------------------------------------------------------

    /**
     * Get the geocode data for the specified address.
     * @param address Address to query the coordinates for.
     * @param region Optional TLD biasing region.
     */
    getGeocode = async (address: string, region?: string): Promise<MapCoordinates[]> => {
        try {
            if (!address && address.length < 3) {
                throw new Error("Invalid or missing address")
            }

            // Sanitize address and get its ID.
            address = jaul.data.removeFromString(address, ["%", "{", "}", "[", "]", "@"])
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

            // Geo request parameters.
            const geoRequest: GeocodeRequest = {
                params: {
                    address: address,
                    region: region,
                    key: settings.maps.api.key
                }
            }

            // A region was specified?
            if (region) {
                region = region.toLowerCase()
                geoRequest.params.region = region
            }

            // Get geocode from Google Maps.
            const res = await this.client.geocode(geoRequest)

            if (res.data && res.data.results && res.data.results.length > 0) {
                const results = []

                // Iterate results from Google and populate coordinates.
                for (let r of res.data.results) {
                    results.push({
                        address: r.formatted_address,
                        latitude: r.geometry.location.lat,
                        longitude: r.geometry.location.lng,
                        placeId: r.place_id
                    })
                }

                cache.set("maps", `${region}-${addressId}`, results)
                logger.info("Maps.getGeocode", address, region, `${results.length} result(s)`)
                return results
            }

            // Error returned by the Maps API?
            if (res.data && res.data.error_message) {
                throw new Error(res.data.error_message)
            }

            logger.info("Maps.getGeocode", address, region, `No results for: ${address}`)
            return []
        } catch (ex) {
            logger.error("Maps.getGeocode", address, region, ex)
            throw ex
        }
    }

    /**
     * Get the reverse geocode data for the specified coordinates.
     * @param coordinates Lat / long coordinates to be queried.
     */
    getReverseGeocode = async (coordinates: [number, number]): Promise<MapAddress> => {
        try {
            if (!coordinates && coordinates.length != 2) {
                throw new Error("Invalid or missing coordinates")
            }

            // Cache coordinates with a precision of 1km.
            const cacheId = `reverse-${coordinates.map((c) => (Math.round(c * 100) / 100).toFixed(settings.maps.cachePrecision)).join("-")}`
            const logCoordinates = coordinates.join(", ")

            // Location stored on cache?
            const cached = cache.get("maps", cacheId)
            if (cached) {
                logger.debug("Maps.getReverseGeocode.fromCache", logCoordinates, `${Object.values(cached).join(", ")}`)
                return cached
            }

            // Geo request parameters.
            const geoRequest: ReverseGeocodeRequest = {
                params: {
                    latlng: coordinates,
                    key: settings.maps.api.key
                }
            }

            // Get geocode from Google Maps.
            const res = await this.client.reverseGeocode(geoRequest)

            if (res.data && res.data.results && res.data.results.length > 0) {
                const components = res.data.results[0].address_components

                // Get relevant address components.
                const neighborhood = components.find((c) => c.types.includes("neighborhood" as any) || c.types.includes("sublocality" as any))
                const city = components.find((c) => c.types.includes("locality" as any) || c.types.includes("administrative_area_level_2" as any))
                const state = components.find((c) => c.types.includes("administrative_area_level_1" as any))
                const country = components.find((c) => c.types.includes("country" as any))

                // Build the resulting MapAddress.
                const address: MapAddress = {}
                if (neighborhood) address.neighborhood = neighborhood.long_name
                if (city) address.city = city.long_name
                if (state) address.state = state.long_name
                if (country) address.country = country.long_name

                cache.set("maps", cacheId, address)
                logger.info("Maps.getReverseGeocode", logCoordinates, Object.values(address).join(", "))

                return address
            }

            // Error returned by the Maps API?
            if (res.data && res.data.error_message) {
                throw new Error(res.data.error_message)
            }

            logger.info("Maps.getReverseGeocode", logCoordinates, `No results for: ${logCoordinates}`)
            return null
        } catch (ex) {
            const logCoordinates = coordinates ? coordinates.join(", ") : "[]"
            logger.error("Maps.getReverseGeocode", logCoordinates, ex)
            throw ex
        }
    }

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
