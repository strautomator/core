"use strict";
// Strautomator Core: Maps
Object.defineProperty(exports, "__esModule", { value: true });
const google_maps_services_js_1 = require("@googlemaps/google-maps-services-js");
const cache = require("bitecache");
const jaul = require("jaul");
const logger = require("anyhow");
const axios = require("axios").default;
const settings = require("setmeup").settings;
/**
 * Google Maps wrapper.
 */
class Maps {
    constructor() {
        /**
         * Google Maps client.
         */
        this.client = null;
        // INIT
        // --------------------------------------------------------------------------
        /**
         * Init the database wrapper.
         */
        this.init = async () => {
            try {
                if (!settings.maps.api.key) {
                    throw new Error("Missing the mandatory maps.api.key setting");
                }
                this.client = new google_maps_services_js_1.Client();
                cache.setup("maps", settings.maps.cacheDuration);
                logger.info("Maps.init");
            }
            catch (ex) {
                logger.error("Maps.init", ex);
                throw ex;
            }
        };
        // METHODS
        // --------------------------------------------------------------------------
        /**
         * Get the geocode data for the specified address.
         * @param address Address to query the coordinates for.
         * @param region Optional TLD biasing region.
         */
        this.getGetcode = async (address, region) => {
            logger.debug("Maps.getGetcode", address);
            try {
                if (!address && address.length < 3) {
                    throw new Error("Invalid or missing address");
                }
                address = address.toLowerCase();
                // Adapt region to correct ccTLD.
                if (region == "gb") {
                    region = "uk";
                }
                // Location stored on cache?
                const cached = cache.get("maps", `${region}-${address}`);
                if (cached)
                    return cached;
                // Remove invalid characters from address.
                address = address.toLowerCase();
                address = jaul.data.removeFromString(address, ["%", "{", "}", "[", "]", "@"]);
                const geoRequest = {
                    params: {
                        address: address,
                        region: region,
                        key: settings.maps.api.key
                    }
                };
                // A region was specified?
                if (region) {
                    region = region.toLowerCase();
                    geoRequest.params.region = region;
                }
                // Get geocode from Google Maps.
                const res = await this.client.geocode(geoRequest);
                if (res.data && res.data.results && res.data.results.length > 0) {
                    const results = [];
                    // Iterate results from Google and populate coordinates.
                    for (let r of res.data.results) {
                        results.push({
                            address: r.formatted_address,
                            latitude: r.geometry.location.lat,
                            longitude: r.geometry.location.lng,
                            placeId: r.place_id
                        });
                    }
                    cache.set("maps", `${region}-${address}`, results);
                    logger.info("Maps.getGeocode", address, region, `${results.length} result(s)`);
                    return results;
                }
                return [];
            }
            catch (ex) {
                logger.error("Maps.getGetcode", address, region, ex);
            }
            return null;
        };
        /**
         * Download a static PNG image representing a map for the specified coordinates.
         * @param coordinates The coordinates to get an image for.
         */
        this.getStaticImage = async (coordinates, options) => {
            try {
                if (!options) {
                    options = {};
                }
                if (!options.style) {
                    options.style = settings.maps.defaultStyle;
                }
                if (!options.size) {
                    options.size = settings.maps.defaultSize;
                }
                if (!options.zoom) {
                    options.zoom = settings.maps.defaultZoom;
                }
                // Build parameters and URL.
                const key = `key=${settings.maps.api.key}`;
                const center = `center=${coordinates.latitude},${coordinates.longitude}`;
                const size = `size=${options.size}x${options.size}`;
                const zoom = `zoom=${options.zoom}`;
                const markers = `markers=${options.style}|${coordinates.latitude},${coordinates.longitude}`;
                let url = `${settings.maps.api.baseStaticUrl}${key}&${center}&${size}&${zoom}&${markers}`;
                // Specified a circle radius? Add a circle to the map.
                if (options.circle) {
                    const circle = this.getCircleString(coordinates, options.circle);
                    url += `&${circle}`;
                }
                else {
                    options.circle = "none";
                }
                // Download static image from Google Maps.
                const res = await axios.get(url, { responseType: "arraybuffer" });
                const image = Buffer.from(res.data, "binary");
                logger.info("Maps.getStaticImage", Object.values(coordinates).join(", "), `Size ${options.size}`, `Circle ${options.circle}`);
                return image;
            }
            catch (ex) {
                logger.error("Maps.getStaticImage", Object.values(coordinates).join(", "), `Size ${options.size}`, `Circle ${options.circle}`, ex);
            }
        };
        /**
         * Return a path string representing a circle to be draw on a static map image.
         * @param coordinates The center coordinates.
         * @param radius The circle radius.
         */
        this.getCircleString = (coordinates, radius) => {
            const detail = 8;
            const r = 6371;
            const pi = Math.PI;
            let latAux = (coordinates.latitude * pi) / 180;
            let longAux = (coordinates.longitude * pi) / 180;
            let d = radius / 1000 / r;
            let result = `path=color:${settings.maps.circleColor}EE|fillcolor:${settings.maps.circleColor}55|weight:1`;
            for (let i = 0; i <= 360; i += detail) {
                var brng = (i * pi) / 180;
                var pLat = Math.asin(Math.sin(latAux) * Math.cos(d) + Math.cos(latAux) * Math.sin(d) * Math.cos(brng));
                var pLng = ((longAux + Math.atan2(Math.sin(brng) * Math.sin(d) * Math.cos(latAux), Math.cos(d) - Math.sin(latAux) * Math.sin(pLat))) * 180) / pi;
                pLat = (pLat * 180) / pi;
                result += "|" + pLat + "," + pLng;
            }
            return result;
        };
    }
    static get Instance() {
        return this._instance || (this._instance = new this());
    }
}
exports.Maps = Maps;
// Exports...
exports.default = Maps.Instance;
