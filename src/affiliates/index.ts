// Strautomator Core: Affiliates

import {AffiliateLink} from "./types"
import {AwinPromotion} from "../awin/types"
import {UserData} from "../users/types"
import awin from "../awin"
import dayjs from "../dayjs"
import maps from "../maps"
import cache from "bitecache"
import logger from "anyhow"
import _ from "lodash"
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
     * Map of current promotions by country.
     */
    currentPromotions: {[country: string]: AwinPromotion[]} = {}

    /**
     * Init the Affiliates manager.
     */
    init = async (): Promise<void> => {
        settings.countryLinkify = settings.affiliates
        cache.setup("affiliates", settings.affiliates.country.cacheDuration)
    }

    // METHODS
    // --------------------------------------------------------------------------

    /**
     * Refresh current promotions for all countries, excluding ones ending in less than 24 hours.
     */
    refreshPromotions = async (): Promise<void> => {
        try {
            const minDate = dayjs().add(24, "hours")
            const countryFeedIds = await awin.getCountryFeedIds()
            const countryCodes = Object.keys(countryFeedIds)

            const fetchPromotions = async (cc) => (this.currentPromotions[cc] = (await awin.getPromotions(cc)).filter((p) => dayjs(p.endDate).isAfter(minDate)))
            await Promise.allSettled(countryCodes.map(fetchPromotions))

            logger.info("Affiliates.refreshPromotions", `Promotions refreshed for ${countryCodes.length} countries`)
        } catch (ex) {
            logger.error("Affiliates.refreshPromotions", ex)
            throw ex
        }
    }

    /**
     * Find products and promotions related to the specified query.
     * @param user The user.
     * @param query Query to be used to find products and promotions.
     */
    findMatchingLinks = async (user: UserData, query: string): Promise<AffiliateLink[]> => {
        try {
            const country = (maps.getCountryCode(user.profile.country) || "US").toLowerCase()
            const result: AffiliateLink[] = []

            // Helper to normalize text (remove special accents).
            const normalizer = (input) => input.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
            const queryText = normalizer(query.toLowerCase())

            // Helper to find matching products.
            const matchProducts = async () => {
                const products = await awin.getProducts(country)
                products.forEach((p) => {
                    const text = normalizer(_.compact([p.product_name, p.product_type, p.brand_name]).join(" ").toLowerCase())
                    if (text.includes(queryText)) {
                        result.push({
                            title: p.product_name,
                            description: p.product_short_description || p.merchant_category || p.category_name,
                            publisher: p.merchant_name || p.brand_name,
                            url: p.aw_deep_link
                        })
                    }
                })
            }

            // Helper to find matching promotions.
            const matchPromotions = async () => {
                const promotions = await awin.getPromotions(country)
                promotions.forEach((p) => {
                    const text = normalizer(p.title.toLowerCase())
                    if (text.includes(queryText)) {
                        result.push({
                            title: p.title,
                            description: p.description,
                            publisher: p.advertiser?.name,
                            url: p.urlTracking
                        })
                    }
                })
            }

            // Match products and promotions and return the results.
            await Promise.allSettled([matchProducts(), matchPromotions()])
            return result
        } catch (ex) {
            logger.error("Affiliates.findMatchingLinks", logHelper.user(user), `Country ${user.profile.country}`, query, ex)
            throw ex
        }
    }
}

// Exports...
export default Affiliates.Instance
