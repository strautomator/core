// Strautomator Functions: Affiliates

import core = require("strautomator-core")
import logger from "anyhow"
import _ from "lodash"

/**
 * Download AWIN promotions.
 */
export const downloadAwinPromotions = async () => {
    logger.info("F.Calendar.regenerate.start")

    try {
        const getCountryFeeds = await core.awin.getCountryFeeds()
        const countryCodes = Object.keys(getCountryFeeds)

        const downloadPromotions = async (cc) => await core.awin.downloadPromotions(cc)
        await Promise.allSettled(countryCodes.map(downloadPromotions))

        logger.info("F.Affiliates.downloadAwinPromotions", `Downloaded promotions for ${countryCodes.length} countries`)
    } catch (ex) {
        logger.error("F.Affiliates.downloadAwinPromotions", ex)
    }
}

/**
 * Download AWIN product feeds.
 */
export const downloadAwinProducts = async () => {
    logger.info("F.Calendar.regenerate.start")

    try {
        const getCountryFeeds = await core.awin.getCountryFeeds()
        const countryCodes = Object.keys(getCountryFeeds)

        const downloadProducts = async (cc) => await core.awin.downloadProducts(cc)
        await Promise.allSettled(countryCodes.map(downloadProducts))

        logger.info("F.Affiliates.downloadAwinProducts", `Downloaded products for ${countryCodes.length} countries`)
    } catch (ex) {
        logger.error("F.Affiliates.downloadAwinProducts", ex)
    }
}
