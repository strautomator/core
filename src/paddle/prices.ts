// Strautomator Core: Paddle Customers

import {Price} from "@paddle/paddle-node-sdk"
import api from "./api"
import _ from "lodash"
import logger from "anyhow"
const settings = require("setmeup").settings

/**
 * Paddle Prices.
 */
export class PaddlePrices {
    private constructor() {}
    private static _instance: PaddlePrices
    static get Instance() {
        return this._instance || (this._instance = new this())
    }

    /**
     * Cache of the yearly price info.
     */
    yearlyPrice: Price

    // METHODS
    // --------------------------------------------------------------------------

    /**
     * Get product prices from Paddle.
     */
    getPrices = async (): Promise<Price[]> => {
        try {
            const result: Price[] = []

            let res = api.client.prices.list({perPage: settings.paddle.api.pageSize})
            let page = await res.next()
            result.push(...page)

            // Keep fetching while more pages are available.
            while (res.hasMore) {
                page = await res.next()
                result.push(...page)
            }

            // Cache the yearly price.
            this.yearlyPrice = result.find((p) => p.billingCycle.interval == "year")

            const logDetails = result.map((p) => `${p.name} - ${parseFloat(p.unitPrice.amount) / 100} / ${p.billingCycle.frequency} ${p.billingCycle.interval}`).join(", ")
            logger.info("Paddle.getPrices", logDetails)

            return result
        } catch (ex) {
            logger.error("Paddle.getPrices", ex)
            throw ex
        }
    }
}

// Exports...
export default PaddlePrices.Instance
