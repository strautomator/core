// Strautomator Core: Affiliates

import {AffiliateProduct, AwinCsvProduct} from "./types"
import {StorageBucket} from "../storage/types"
import {UserData} from "../users/types"
import {axiosRequest} from "../axios"
import dayjs from "../dayjs"
import maps from "../maps"
import storage from "../storage"
import cache from "bitecache"
import csvParser from "csv-parser"
import logger from "anyhow"
import JSZip from "jszip"
import * as logHelper from "../loghelper"
const settings = require("setmeup").settings

/**
 * Affiliate links and products. This class shares its settings with the CountryLinkify module.
 */
export class Affiliates {
    private constructor() {}
    private static _instance: Affiliates
    static get Instance() {
        return this._instance || (this._instance = new this())
    }

    /**
     * Map of target countries.
     */
    targetCountries: {[key: string]: string} = {}

    /**
     * Init the Affiliates manager.
     */
    init = async (): Promise<void> => {
        const cacheDuration = settings.countryLinkify.country.cacheDuration
        const duration = dayjs.duration(cacheDuration, "seconds").humanize()
        cache.setup("affiliates", cacheDuration)

        const countries = Object.entries(settings.countryLinkify.country).filter((c) => Array.isArray(c[1]))
        countries.forEach((c) => {
            const arrCountries = c[1] as string[]
            const code = c[0].toUpperCase()
            this.targetCountries[code] = code
            arrCountries.forEach((ac) => (this.targetCountries[ac.toUpperCase()] = code))
        })

        this.targetCountries.default = settings.countryLinkify.country.default

        logger.info("Affiliates.init", `Cache affiliate references for up to ${duration}`)
    }

    // AWIN
    // --------------------------------------------------------------------------

    /**
     * Download a product feed from AWIN for the specified country.
     * @param country Country (name or code).
     * @param asString If true, will return the CSV data as string, default is false (returns as stream).
     */
    getAwinFeed = async (country: string, asString?: boolean): Promise<NodeJS.ReadableStream | string> => {
        try {
            country = maps.getCountryCode(country)

            const columns =
                "aw_deep_link,product_name,aw_product_id,merchant_product_id,merchant_image_url,description,merchant_category,search_price,merchant_name,merchant_id,category_name,category_id,aw_image_url,currency,store_price,delivery_cost,merchant_deep_link,language,last_updated,display_price,data_feed_id,brand_name,product_model,specifications,product_short_description,condition,model_number,keywords,promotional_text,product_type,in_stock,brand_id,colour,dimensions,merchant_thumb_url,large_image"
            const urls: {[country: string]: string} = {}
            Object.entries(settings.affiliates.awin).forEach((a) => {
                const country = (a[0] as string).toUpperCase()
                const url = a[1] as string
                urls[country] = url.replace("${columns}", columns)
            })

            const targetCountry = this.targetCountries[country] || this.targetCountries["default"]
            const targetUrl = urls[targetCountry]

            // Stop here if we do not have a feed for the specified country.
            if (!targetUrl) {
                logger.warn("Affiliates.getAwinFeed", `No target URL set for country ${country}, abort`)
                return null
            }

            // Download the ZIP file from AWIN.
            const zipDownload = await axiosRequest({url: targetUrl, responseType: "arraybuffer"})
            logger.debug("Affiliates.getAwinFeed", `Country ${country}`, `Downloaded: ${targetUrl}`)

            // Extract the CSV file from the ZIP.
            const zipFile = await JSZip.loadAsync(zipDownload)
            const csvFile = zipFile.file(/\.csv$/)[0]
            const result = asString ? await csvFile.async("text") : await csvFile.nodeStream("nodebuffer")

            logger.info("Affiliates.getAwinFeed", `Country ${country}`, csvFile.name)
            return result
        } catch (ex) {
            logger.error("Affiliates.getAwinFeed", country, ex)
        }
    }

    /**
     * Download and save the AWIN feed for the specified country to the cache bucket.
     * @param country Country (name or code).
     */
    saveAwinFeed = async (country: string): Promise<void> => {
        try {
            country = maps.getCountryCode(country)

            // Download and save the feed.
            const feed = (await this.getAwinFeed(country, true)) as string
            await storage.setFile(StorageBucket.Cache, `awinfeed-${country.toLowerCase()}.csv`, feed, "text/csv")
            logger.info("Affiliates.saveAwinFeed", country, `Size: ${feed.length} bytes`)
        } catch (ex) {
            logger.error("Affiliates.saveAwinFeed", country, ex)
        }
    }

    /**
     * Find products related to the specified query.
     * @param user The user.
     * @param productQuery Query to be used to find products.
     * @param feed Optional, find in the specified feed, if not set a cached feed will be used.
     */
    findMatchingProducts = async (user: UserData, productQuery: string, feed?: NodeJS.ReadableStream): Promise<AffiliateProduct[]> => {
        return new Promise(async (resolve, reject) => {
            try {
                const country = maps.getCountryCode(user.profile.country)

                // If a feed was not provided, get the cached feed from the storage.
                if (!feed) {
                    const cachedFile = await storage.getFile(StorageBucket.Cache, `awinfeed-${country.toLowerCase()}.csv`)
                    if (cachedFile) {
                        feed = cachedFile.createReadStream()
                    }
                }
                if (!feed) {
                    logger.warn("Affiliates.findMatchingProducts", logHelper.user(user), `Country ${user.profile.country}`, productQuery, "No feed available")
                    return resolve(null)
                }

                // Stream the CSV and find matching products on the fly.
                const products: AffiliateProduct[] = []
                feed.pipe(csvParser({separator: "|"}))
                    .on("data", (awinProd: AwinCsvProduct) => {
                        if (awinProd.product_name?.toLowerCase().includes(productQuery.toLowerCase())) {
                            products.push({
                                name: awinProd.product_name,
                                category: awinProd.merchant_category || awinProd.category_name,
                                publisher: awinProd.brand_name,
                                url: awinProd.aw_deep_link
                            })
                        }
                    })
                    .on("end", () => {
                        logger.info("Affiliates.findMatchingProducts", logHelper.user(user), `Country ${user.profile.country}`, productQuery, `Found ${products.length} matches`)
                        resolve(products)
                    })
                return feed
            } catch (ex) {
                logger.error("Affiliates.findMatchingProducts", logHelper.user(user), `Country ${user.profile.country}`, productQuery, ex)
                reject(ex)
            }
        })
    }
}

// Exports...
export default Affiliates.Instance
