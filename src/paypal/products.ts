// Strautomator Core: PayPal Products

import {PayPalProduct} from "./types"
import api from "./api"
import logger = require("anyhow")
import dayjs from "dayjs"
import dayjsUTC from "dayjs/plugin/utc"
const settings = require("setmeup").settings

// Extends dayjs with UTC.
dayjs.extend(dayjsUTC)

/**
 * PayPal Products API.
 */
export class PayPalProducts {
    private constructor() {}
    private static _instance: PayPalProducts
    static get Instance() {
        return this._instance || (this._instance = new this())
    }

    // PRODUCT METHODS
    // --------------------------------------------------------------------------

    /**
     * Get products registered on PayPal.
     */
    getProducts = async (): Promise<PayPalProduct[]> => {
        try {
            const products: PayPalProduct[] = []
            const options = {
                url: "catalogs/products",
                returnRepresentation: true,
                params: {
                    page: 1,
                    page_size: 20
                }
            }

            const res = await api.makeRequest(options)

            // Try matching a product with the same name as the one defined on the settings.
            if (!res.products || res.products.length == 0) {
                logger.warn("PayPal.getProducts", "No products returned from PayPal")
                return []
            }

            // Iterate response and build product objects.
            for (let p of res.products) {
                products.push({
                    id: p.id,
                    name: p.name,
                    dateCreated: dayjs.utc(p.create_time).toDate()
                })
            }

            logger.info("PayPal.getProducts", `Got ${products.length} products`)
            return products
        } catch (ex) {
            logger.error("PayPal.getProducts", "Could not fetch products from PayPal")
            throw ex
        }
    }

    /**
     * Create the Strautomator product on PayPal, returns the newly created product.
     */
    createProduct = async (): Promise<PayPalProduct> => {
        try {
            const options = {
                url: "catalogs/products",
                method: "POST",
                returnRepresentation: true,
                data: {
                    name: settings.paypal.billingPlan.productName,
                    description: settings.paypal.billingPlan.description,
                    type: "SERVICE",
                    category: "SOFTWARE",
                    image_url: `${settings.app.url}images/logo-round.png`,
                    home_url: settings.app.url
                }
            }

            const res = await api.makeRequest(options)

            // Make sure response has a valid ID.
            if (!res || !res.id) {
                throw new Error("Invalid response from PayPal")
            }

            logger.info("PayPal.createProduct", `New product ID: ${res.id}`)

            return {
                id: res.id,
                name: res.name,
                dateCreated: dayjs.utc(res.create_time).toDate()
            }
        } catch (ex) {
            logger.error("PayPal.createProduct", "Could not create a new product on PayPal")
            throw ex
        }
    }
}

// Exports...
export default PayPalProducts.Instance
