// Strautomator Core: AWIN

import {AwinProduct, AwinPromotion} from "./types"
import {StorageBucket} from "../storage/types"
import {axiosRequest} from "../axios"
import {AxiosRequestConfig} from "axios"
import dayjs from "../dayjs"
import storage from "../storage"
import cache from "bitecache"
import jaul from "jaul"
import logger from "anyhow"
import csvParser from "csv-parser"
import _ from "lodash"
import JSZip from "jszip"
const settings = require("setmeup").settings

/**
 * AWIN affiliates manager.
 */
export class AWIN {
    private constructor() {}
    private static _instance: AWIN
    static get Instance() {
        return this._instance || (this._instance = new this())
    }

    /**
     * Init the AWIN manager.
     */
    init = async (): Promise<void> => {
        if (!settings.awin.api.token) {
            logger.warn("AWIN.init", "Missing the awin.api.token setting, won't be able to fetch promotions from AWIN")
        }
        if (!settings.awin.feeds.key) {
            logger.warn("AWIN.init", "Missing the awin.feeds.key setting, won't be able to fetch product feeds from AWIN")
        }

        cache.setup("awin", settings.awin.cacheDuration)
    }

    // DOWNLOADING DATA
    // --------------------------------------------------------------------------

    /**
     * Download the master feed data list from AWIN and get the active feed IDs for each country.
     */
    getCountryFeedIds = async (): Promise<{[country: string]: string[]}> => {
        return new Promise(async (resolve, reject) => {
            try {
                const logFeeds = (countryFeedIds) => `Countries: ${Object.keys(countryFeedIds).join(", ")} - total ${_.sumBy(Object.values(countryFeedIds), (f: any) => f.length)} feeds`
                const cacheId = "feed-ids"

                // Check if we still have the feed IDs in the cache.
                const fromCache = cache.get("awin", cacheId)
                if (fromCache) {
                    logger.info("AWIN.getCountryFeedIds", logFeeds(fromCache), "From cache")
                    return resolve(fromCache)
                }

                const minDate = dayjs().subtract(settings.awin.feeds.maxAgeDays, "days")
                const url = jaul.data.replaceTags(settings.awin.feeds.listUrl, {publisherId: settings.awin.publisherId, key: settings.awin.feeds.key})
                const res = await axiosRequest({url, responseType: "stream"})
                const countryFeedIds = {}

                // Helper to parse individual rows from the CSV.
                const onData = (row) => {
                    const region = row["Primary Region"]
                    const active = row["Membership Status"] == "active"
                    const lastDate = dayjs(row["Last Checked"] || row["Last Imported"] || minDate.subtract(1, "year"))

                    // Only add feeds that are active and have been checked recently.
                    if (region && active && lastDate.isAfter(minDate)) {
                        const countryCode = region.toLowerCase()
                        if (!countryFeedIds[countryCode]) {
                            countryFeedIds[countryCode] = []
                        }
                        countryFeedIds[countryCode].push(row["Feed ID"])
                    }
                }

                // Helpers to process errors and end the stream.
                const onError = (err) => {
                    logger.error("AWIN.getCountryFeedIds", err)
                    return reject(err)
                }
                const onEnd = async () => {
                    logger.info("AWIN.getCountryFeedIds")
                    cache.set("awin", cacheId, countryFeedIds)
                    return resolve(countryFeedIds)
                }

                // Parse the CSV and get the list of feed IDs for each country.
                const csvStream = csvParser({separator: ","})
                res.pipe(csvStream).on("data", onData).on("error", onError).on("end", onEnd)
            } catch (ex) {
                logger.error("AWIN.getCountryFeedIds", ex)
                return reject(ex)
            }
        })
    }

    /**
     * Download product feeds from AWIN.
     * @param countryCode Country code.
     */
    downloadProducts = async (countryCode: string): Promise<void> => {
        return new Promise(async (resolve, reject) => {
            try {
                const countryFeedIds = await this.getCountryFeedIds()
                if (!countryFeedIds[countryCode]) {
                    logger.warn("AWIN.downloadProducts", countryCode, "No feeds available for this country")
                    return resolve()
                }

                const feedSettings = settings.awin.feeds
                const languages = {
                    de: ["de", "at", "ch"],
                    fr: ["fr", "be"],
                    it: ["it"],
                    es: ["ar", "es", "cl", "mx", "pe"],
                    nl: ["nl", "be"],
                    pl: ["pl"],
                    pt: ["br", "pt"]
                }

                // Download the feed for the specified country. Language defaults to "en".
                const lang = Object.keys(languages).find((l) => languages[l].includes(countryCode)) || "en"
                const tags = {key: feedSettings.key, language: lang, columns: feedSettings.columns, feedIds: countryFeedIds[countryCode].join(",")}
                const url = jaul.data.replaceTags(feedSettings.baseUrl, tags)

                // Download the ZIP file from AWIN.
                const zipDownload = await axiosRequest({url, responseType: "arraybuffer"})
                logger.debug("AWIN.downloadProducts", `Country ${countryCode}`, `Downloaded: ${url}`)

                // Extract the CSV file from the ZIP.
                const zipFile = await JSZip.loadAsync(zipDownload)
                const csvFile = zipFile.file(/\.csv$/)[0]
                const csvData = await csvFile.nodeStream("nodebuffer")
                const result = []

                // Helper to parse individual rows from the CSV. Only include products in stock.
                const onData = (p: AwinProduct) => {
                    if (p.in_stock == "1") {
                        result.push(JSON.stringify(p, null, 0))
                    }
                }

                // Helper to process errors and save to the storage cache after ending the stream.
                const onError = (err) => {
                    logger.error("AWIN.downloadProducts", countryCode, err)
                    return reject(err)
                }
                const onEnd = async () => {
                    try {
                        await storage.setFile(StorageBucket.Cache, `awin-products-${countryCode}.json`, `[${result.join(",")}]`, "text/json")
                        logger.info("AWIN.downloadProducts", countryCode, `${result.length} products`)
                        return resolve()
                    } catch (innerEx) {
                        onError(innerEx)
                    }
                }

                // Parse the CSV and only include products in stock. The result will be saved to the cache storage.
                const csvStream = csvParser({separator: "|"})
                csvData.pipe(csvStream).on("data", onData).on("error", onError).on("end", onEnd)
            } catch (ex) {
                logger.error("AWIN.downloadProducts", countryCode, ex)
            }
        })
    }

    /**
     * Helper to get list of current promotions for the specified country.
     * @param countryCode The country code.
     */
    downloadPromotions = async (countryCode: string): Promise<void> => {
        try {
            const url = `${settings.awin.api.baseUrl}publisher/${settings.awin.publisherId}/promotions`
            const headers = {Authorization: `Bearer ${settings.awin.api.token}`}
            const data = {filters: {regionCodes: [countryCode.toUpperCase()], membership: "joined"}}
            const reqOptions: AxiosRequestConfig = {url, headers, data, method: "POST", responseType: "json"}
            const result = []

            // Keep fetching while there are more pages.
            let res = await axiosRequest(reqOptions)
            while (res.data && res.data.length > 0 && res.pagination.page <= res.pagination.total) {
                result.push(...res.data.map((p) => JSON.stringify(_.pick(p, ["promotionId", "title", "description", "startDate", "endDate", "urlTracking", "advertiser"]), null, 0)))
                reqOptions.data.pagination = {page: res.pagination.page + 1}
                res = await axiosRequest(reqOptions)
            }

            await storage.setFile(StorageBucket.Cache, `awin-promotions-${countryCode}.json`, `[${result.join(",")}]`, "text/json")
            logger.info("AWIN.downloadPromotions", countryCode, `${result.length} promotions`)
        } catch (ex) {
            logger.error("AWIN.downloadPromotions", countryCode, ex)
        }
    }

    // GETTING CACHED DATA
    // --------------------------------------------------------------------------

    /**
     * Get the AWIN product feed for the specified country.
     * @param countryCode Country code.
     */
    getProducts = async (countryCode: string): Promise<AwinProduct[]> => {
        try {
            const cachedFile = await storage.getFile(StorageBucket.Cache, `awin-products-${countryCode.toLowerCase()}.json`)
            if (!cachedFile) {
                logger.warn("AWIN.getProducts", countryCode, "No product feeds found in the cache storage")
                return []
            }

            // Download feed from the storage cache in chunks, and return the full string.
            const chunks = []
            const stream = cachedFile.createReadStream()
            for await (const chunk of stream) {
                chunks.push(Buffer.from(chunk))
            }

            return JSON.parse(Buffer.concat(chunks).toString("utf8"))
        } catch (ex) {
            logger.error("AWIN.getProducts", countryCode, ex)
            throw ex
        }
    }

    /**
     * Get the AWIN promotions feed for the specified country.
     * @param countryCode Country code.
     */
    getPromotions = async (countryCode: string): Promise<AwinPromotion[]> => {
        try {
            const cachedFile = await storage.getFile(StorageBucket.Cache, `awin-promotions-${countryCode.toLowerCase()}.csv`)
            if (!cachedFile) {
                logger.warn("AWIN.getPromotions", countryCode, "No promotion feeds available in the cache storage")
                return []
            }

            // Download feed from the storage cache in chunks, and return the full string.
            const chunks = []
            const stream = cachedFile.createReadStream()
            for await (const chunk of stream) {
                chunks.push(Buffer.from(chunk))
            }

            return JSON.parse(Buffer.concat(chunks).toString("utf8"))
        } catch (ex) {
            logger.error("AWIN.getPromotions", countryCode, ex)
            throw ex
        }
    }
}

// Exports...
export default AWIN.Instance
