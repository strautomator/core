// Strautomator Core: PayPal

import {PayPalBillingPlan, PayPalProduct} from "./types"
import api from "./api"
import paypalProducts from "./products"
import paypalSubscriptions from "./subscriptions"
import paypalWebhooks from "./webhooks"
import _ = require("lodash")
import logger = require("anyhow")
const settings = require("setmeup").settings

/**
 * PayPal Manager.
 */
export class PayPal {
    private constructor() {}
    private static _instance: PayPal
    static get Instance() {
        return this._instance || (this._instance = new this())
    }

    /**
     * Product methods.
     */
    products = paypalProducts

    /**
     * Subscription methods.
     */
    subscriptions = paypalSubscriptions

    /**
     * Webhook methods.
     */
    webhooks = paypalWebhooks

    /**
     * Shortcut to api.currentProduct.
     */
    get currentProduct(): PayPalProduct {
        return api.currentProduct
    }

    /**
     * Shortcut to api.currentBillingPlans.
     */
    get currentBillingPlans(): {[id: string]: PayPalBillingPlan} {
        return api.currentBillingPlans
    }

    // INIT
    // --------------------------------------------------------------------------

    /**
     * Init the PayPal wrapper. It will first get active billing plans from PayPal,
     * parse them, and create new ones in case the frequency or price has changed.
     */
    init = async (): Promise<void> => {
        try {
            if (!settings.paypal.api.clientId) {
                throw new Error("Missing the mandatory paypal.api.clientId setting")
            }
            if (!settings.paypal.api.clientSecret) {
                throw new Error("Missing the mandatory paypal.api.clientSecret setting")
            }

            // Try authenticating first.
            await api.authenticate()

            // Setup the product and billing plans on PayPal.
            await this.setupProduct()
            await this.setupBillingPlans()

            // Setup a valid webhook on PayPal.
            await this.setupWebhook()
        } catch (ex) {
            logger.error("PayPal.init", ex)
            throw ex
        }
    }

    /**
     * Create the Strautomator product on PayPal, if one does not exist yet.
     */
    setupProduct = async (): Promise<void> => {
        try {
            const productName = settings.paypal.billingPlan.productName
            const products = await paypalProducts.getProducts()
            let existingProduct

            // Try matching a product with the same name as the one defined on the settings.
            if (products.length > 0) {
                existingProduct = _.find(products, {name: productName})

                // Product found? Get its ID.
                if (existingProduct) {
                    api.currentProduct = existingProduct
                    logger.info("PayPal.setupProduct", `Product ID: ${existingProduct.id}`)
                    return
                }

                logger.warn("PayPal.setupProduct", `Found no products matching name: ${productName}`, `Will create a new one`)
            }

            // Create new product if none was found before.
            api.currentProduct = await paypalProducts.createProduct()
        } catch (ex) {
            logger.error("PayPal.setupProduct", ex)
            throw ex
        }
    }

    /**
     * Get and / or create the necessary billing plans on PayPal. Only the last created billing
     * plans will be marked as enabled (one for each frequency).
     */
    setupBillingPlans = async () => {
        try {
            api.currentBillingPlans = {}

            const activePlanIds = []
            const billingPlans = await paypalSubscriptions.getBillingPlans()
            const frequencies = Object.keys(settings.plans.pro.price)

            // Match existing plans by looking for the frequency and price on the title.
            for (let plan of billingPlans) {
                api.currentBillingPlans[plan.id] = plan
            }

            // Make sure we have a billing plan for each frequency defined on the settings.
            for (let frequency of frequencies) {
                const price = settings.plans.pro.price[frequency]
                const existing = _.find(api.currentBillingPlans, {price: price, frequency: frequency})

                if (!existing) {
                    const newPlan = await paypalSubscriptions.createBillingPlan(api.currentProduct.id, frequency)
                    api.currentBillingPlans[newPlan.id] = newPlan
                }
            }

            logger.info("PayPal.setupBillingPlans", `Active plans: ${Object.keys(api.currentBillingPlans).join(", ")}`)
        } catch (ex) {
            logger.error("PayPal.setupBillingPlans", ex)
            throw ex
        }
    }

    /**
     * Check if a webhook is registered on PayPal, and if not, register it now.
     */
    setupWebhook = async (): Promise<void> => {
        try {
            const webhooks = await paypalWebhooks.getWebhooks()
            const existingWebhook = _.find(webhooks, {url: api.webhookUrl})

            // No webhooks on PayPal yet? Register one now.
            if (!existingWebhook) {
                logger.warn("PayPal.setupWebhook", "No matching webhooks found on PayPal, will register one now")
                await paypalWebhooks.createWebhook()
            }
        } catch (ex) {
            logger.error("PayPal.setupWebhook", ex)
            throw ex
        }
    }
}

// Exports...
export default PayPal.Instance
