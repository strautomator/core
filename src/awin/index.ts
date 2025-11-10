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

    /**
     * Helper to read JSON data from the cache storage.
     * @param filename Source filename.
     * @param zip Optional, if true will read from a .zip file and unzip the data from inside.
     */
    private readFromCache = async (filename: string, zip?: boolean) => {
        try {
            const cachedFile = await storage.getFile(StorageBucket.Cache, zip ? `${filename}.zip` : filename)
            if (!cachedFile) {
                logger.debug("AWIN.readFromCache", filename, "Not found")
                return null
            }

            // Download from the storage cache in chunks, and return the file contents.
            const chunks = []
            const stream = cachedFile.createReadStream()
            for await (const chunk of stream) {
                chunks.push(Buffer.from(chunk))
            }

            // Extract and return the file from the ZIP.
            if (zip) {
                const zipFile = await JSZip.loadAsync(Buffer.concat(chunks))
                const jsonFile = zipFile.file(/\.json$/)[0]
                return JSON.parse(await jsonFile.async("text"))
            } else {
                return Buffer.concat(chunks).toString("utf8")
            }
        } catch (ex) {
            logger.error("AWIN.readFromCache", filename, `Zip: ${zip}`, ex)
        }
    }

    /**
     * Helper to save JSON data to the cache storage.
     * @param filename Target filename.
     * @param data Data to be saved.
     * @param zip Optional, if true will zip the data before saving (and append .zip to the filename).
     */
    private saveToCache = async (filename: string, data: any, zip?: boolean) => {
        try {
            if (zip) {
                const zipFile = new JSZip()
                zipFile.file(filename, data, {compression: "DEFLATE"})
                await storage.setFile(StorageBucket.Cache, `${filename}.zip`, await zipFile.generateAsync({type: "nodebuffer"}), "application/zip")
            } else {
                await storage.setFile(StorageBucket.Cache, filename, data)
            }

            logger.debug("AWIN.saveToCache", filename, zip)
        } catch (ex) {
            logger.error("AWIN.saveToCache", filename, `Zip: ${zip}`, ex)
        }
    }

    // DOWNLOADING DATA
    // --------------------------------------------------------------------------

    /**
     * Download the master feed data list from AWIN and get the list of feed URLs for each country.
     */
    getCountryFeeds = async (): Promise<{[country: string]: string[]}> => {
        return new Promise(async (resolve, reject) => {
            try {
                const feedSettings = settings.awin.feeds
                const cacheId = "country-feeds"

                // Check if we still have the feed IDs in the cache.
                const fromCache = cache.get("awin", cacheId)
                if (fromCache) {
                    return resolve(fromCache)
                }

                const minDate = dayjs().subtract(feedSettings.maxAgeDays, "days")
                const url = jaul.data.replaceTags(feedSettings.listUrl, {publisherId: settings.awin.publisherId, key: feedSettings.key})
                const res = await axiosRequest({url, responseType: "stream"})
                const countryFeeds = {}

                // Helper to parse individual rows from the CSV.
                const onData = (row) => {
                    const region = row["Primary Region"]
                    const active = row["Membership Status"] == "active"
                    const lastDate = dayjs(row["Last Checked"] || row["Last Imported"] || minDate.subtract(1, "year"))

                    // Only add feeds that are active and have been checked recently.
                    if (region && active && lastDate.isAfter(minDate)) {
                        const countryCode = region.toLowerCase()
                        if (!countryFeeds[countryCode]) {
                            countryFeeds[countryCode] = []
                        }
                        const urlParts = row["URL"].split("/")
                        const tags = {key: feedSettings.key, columns: feedSettings.columns, feedId: row["Feed ID"], language: urlParts[urlParts.indexOf("language") + 1]}
                        const feedUrl = jaul.data.replaceTags(feedSettings.baseUrl, tags)
                        countryFeeds[countryCode].push(feedUrl)
                    }
                }

                // Helpers to process errors and end the stream.
                const onError = (err) => {
                    logger.error("AWIN.getCountryFeeds", err)
                    return reject(err)
                }
                const onEnd = async () => {
                    logger.info("AWIN.getCountryFeeds", `Countries: ${Object.keys(countryFeeds).join(", ")} - total ${_.sumBy(Object.values(countryFeeds), (f: any) => f.length)} feeds`)
                    cache.set("awin", cacheId, countryFeeds)
                    return resolve(countryFeeds)
                }

                // Parse the CSV and get the list of feed IDs for each country.
                const csvStream = csvParser({separator: ","})
                res.pipe(csvStream).on("data", onData).on("error", onError).on("end", onEnd)
            } catch (ex) {
                logger.error("AWIN.getCountryFeeds", ex)
                return reject(ex)
            }
        })
    }

    /**
     * Download product feeds from AWIN.
     * ATTENTION! Some feeds might be hundreds of megabytes in size, so this method should be used with caution,
     * preferably on a dedicated server or cloud function.
     * @param countryCode Country code.
     */
    downloadProducts = async (countryCode: string): Promise<void> => {
        try {
            countryCode = countryCode.toLowerCase()

            const result = []
            const countryFeeds = await this.getCountryFeeds()
            if (!countryFeeds[countryCode]) {
                logger.warn("AWIN.downloadProducts", countryCode, "No feeds available for this country")
                return
            }

            // Helper to download a single advertiser feed.
            const downloadFeed = (url: string) => {
                return new Promise<void>(async (resolve) => {
                    const urlParts = url.split("/")
                    const feedId = urlParts[urlParts.indexOf("fid") + 1]

                    try {
                        const zipDownload = await axiosRequest({url, responseType: "arraybuffer"})
                        logger.debug("AWIN.downloadProducts", `Country ${countryCode}`, `Downloaded: ${url}`)

                        // Extract the CSV file from the ZIP.
                        const zipFile = await JSZip.loadAsync(zipDownload)
                        const csvFile = zipFile.file(/\.csv$/)[0]
                        const csvData = await csvFile.nodeStream("nodebuffer")

                        // Helper to parse individual rows from the CSV. Only include products in stock.
                        const onData = (p: AwinProduct) => {
                            if (p.in_stock == "1") {
                                p = _.omitBy(p, _.isEmpty) as any
                                result.push(JSON.stringify(p, null, 0))
                            }
                        }

                        // Helper to process errors and save to the storage cache after ending the stream.
                        const onError = (err) => {
                            logger.error("AWIN.downloadProducts", countryCode, `Feed ${feedId}`, err)
                            return resolve()
                        }
                        const onEnd = async () => {
                            try {
                                logger.info("AWIN.downloadProducts", countryCode, `Downloaded feed ${feedId}`)
                                return resolve()
                            } catch (innerEx) {
                                onError(innerEx)
                            }
                        }

                        // Parse the CSV and only include products in stock. The result will be saved to the cache storage.
                        const csvStream = csvParser({separator: "|"})
                        csvData.pipe(csvStream).on("data", onData).on("error", onError).on("end", onEnd)
                    } catch (promiseEx) {
                        logger.error("AWIN.downloadProducts", countryCode, `Feed ${feedId}`, promiseEx)
                        return resolve()
                    }
                })
            }

            // Download feeds in batches of 2, and then save the result to the storage cache.
            while (countryFeeds[countryCode].length > 0) {
                await Promise.allSettled(countryFeeds[countryCode].splice(0, 2).map(downloadFeed))
            }

            await this.saveToCache(`awin-products-${countryCode}.json`, `[${result.join(",")}]`, true)
            logger.info("AWIN.downloadProducts", countryCode, `${result.length} products`)
        } catch (ex) {
            logger.error("AWIN.downloadProducts", countryCode, ex)
        }
    }

    /**
     * Helper to get list of current promotions for the specified country.
     * @param countryCode The country code.
     */
    downloadPromotions = async (countryCode: string): Promise<void> => {
        try {
            countryCode = countryCode.toLowerCase()

            const url = `${settings.awin.api.baseUrl}publisher/${settings.awin.publisherId}/promotions`
            const headers = {Authorization: `Bearer ${settings.awin.api.token}`}
            const data = {filters: {regionCodes: [countryCode.toUpperCase()], membership: "joined"}}
            const reqOptions: AxiosRequestConfig = {url, headers, data, method: "POST", responseType: "json"}
            const result: AwinPromotion[] = []

            // Keep fetching while there are more pages. We specifically filter promotions based on domain or advertiser name
            // as some advertisers might have promotions set as global, even thou they do not sell globally.
            let res = await axiosRequest(reqOptions)
            while (res.data?.length > 0 && res.pagination.page <= res.pagination.total) {
                const countryPromotions = res.data.filter((p) => p.url.includes(`.${countryCode}/`) || p.advertiser?.name.includes(`${countryCode.toUpperCase()}`))
                result.push(countryPromotions.map((p) => _.pick(p, ["promotionId", "title", "description", "status", "startDate", "endDate", "url", "urlTracking", "advertiser", "voucher"])))
                reqOptions.data.pagination = {page: res.pagination.page + 1}
                res = await axiosRequest(reqOptions)
            }

            await this.saveToCache(`awin-promotions-${countryCode}.json`, JSON.stringify(result, null, 0))
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
            countryCode = countryCode.toLowerCase()

            const cachedFile: AwinProduct[] = await this.readFromCache(`awin-products-${countryCode}.json`, true)
            if (!cachedFile) {
                logger.warn("AWIN.getProducts", countryCode, "No product feeds found in the cache storage")
                return []
            }

            return cachedFile
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
            countryCode = countryCode.toLowerCase()

            const cachedFile: AwinPromotion[] = await this.readFromCache(`awin-promotions-${countryCode}.json`)
            if (!cachedFile) {
                logger.warn("AWIN.getPromotions", countryCode, "No promotion feeds available in the cache storage")
                return []
            }

            return cachedFile
        } catch (ex) {
            logger.error("AWIN.getPromotions", countryCode, ex)
            throw ex
        }
    }
}

// Exports...
export default AWIN.Instance
