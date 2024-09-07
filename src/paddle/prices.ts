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
     * Cache of current available prices.
     */
    currentPrices: {[id: string]: Price} = {}

    /**
     * Shortcut to get the default yearly price info.
     */
    get yearlyPrice(): Price {
        return this.currentPrices[settings.paddle.priceId]
    }

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

            // Set current cache of prices.
            result.forEach((p) => (this.currentPrices[p.id] = p))

            const logDetails = result.map((p) => `${p.name} - ${p.unitPrice.amount} / ${p.billingCycle.frequency} ${p.billingCycle.interval}`).join(", ")
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
