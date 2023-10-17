// Strautomator Core: PayPal

import {PayPalBillingPlan, PayPalProduct} from "./types"
import {UserData} from "../users/types"
import api from "./api"
import database from "../database"
import eventManager from "../eventmanager"
import paypalProducts from "./products"
import paypalSubscriptions from "./subscriptions"
import paypalTransactions from "./transactions"
import paypalWebhooks from "./webhooks"
import _ from "lodash"
import jaul from "jaul"
import logger from "anyhow"
import dayjs from "../dayjs"
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
     * Transaction methods.
     */
    transactions = paypalTransactions

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

    /**
     * Shortcut to api.legacyBillingPlans.
     */
    get legacyBillingPlans(): {[id: string]: PayPalBillingPlan} {
        return api.legacyBillingPlans
    }

    /**
     * Shortcut to api.webhookUrl.
     */
    get webhookUrl(): string {
        return api.webhookUrl
    }

    // INIT
    // --------------------------------------------------------------------------

    /**
     * Init the PayPal wrapper. It will first get active billing plans from PayPal,
     * parse them, and create new ones in case the frequency or price has changed.
     * @param quickStart If true, will not wait to setup PayPal products and billing plans.
     */
    init = async (quickStart?: boolean): Promise<void> => {
        try {
            if (!settings.paypal.api.clientId) {
                throw new Error("Missing the mandatory paypal.api.clientId setting")
            }
            if (!settings.paypal.api.clientSecret) {
                throw new Error("Missing the mandatory paypal.api.clientSecret setting")
            }

            await this.loadFromCache()

            // Load live data if quickStart was not set.
            if (!quickStart) {
                this.loadLive()
            }

            // Unsubscribe when user gets deleted.
            eventManager.on("Users.delete", this.onUserDelete)
        } catch (ex) {
            logger.error("PayPal.init", ex)
            throw ex
        }
    }

    /**
     * Unsubscribe when user gets deleted.
     * @param user User that was deleted from the database.
     */
    private onUserDelete = async (user: UserData): Promise<void> => {
        try {
            if (user.subscription && user.subscription.enabled && user.subscription.source == "paypal") {
                const subscription = await paypalSubscriptions.getSubscription(user.subscription.id)

                if (subscription) {
                    subscription.userId = user.id
                    await paypalSubscriptions.cancelSubscription(subscription)
                }
            }
        } catch (ex) {
            logger.debug("PayPal.onUserDelete", `Failed to cancel subscription ${user.subscription.id} for user ${user.id} ${user.displayName}`)
        }
    }

    // BASIC SETUP
    // --------------------------------------------------------------------------

    /**
     * Load product and billing plan details from the database.
     */
    loadFromCache = async (): Promise<void> => {
        try {
            const fromCache = await database.appState.get("paypal")

            if (!fromCache) {
                logger.warn("PayPal.loadFromCache", "No PayPal data found")
                return
            }

            // Set initial auth, product and billing plans.
            api.auth = fromCache.auth
            api.mAuth = fromCache.mAuth
            api.currentProduct = fromCache.product
            api.currentBillingPlans = fromCache.billingPlans

            logger.info("PayPal.loadFromCache", `Product: ${api.currentProduct.id}`, `Billing plans: ${Object.keys(api.currentBillingPlans).join(", ")}`)
        } catch (ex) {
            logger.error("PayPal.loadFromCache", ex)
        }
    }

    /**
     * Authenticate with PayPal and load product details and billing plans from the live API.
     */
    loadLive = async (): Promise<void> => {
        const loader = async () => {
            await this.setupProduct()
            await this.setupBillingPlans()
            if (!settings.paypal.cacheDisabled) {
                await database.appState.set("paypal", {product: api.currentProduct, billingPlans: this.currentBillingPlans})
            }
        }

        try {
            const authenticated = await api.authenticate()

            if (authenticated) {
                await loader()
            } else if (api.auth.expiresAt <= dayjs().unix()) {
                throw new Error("PayPal authentication failed")
            }
        } catch (ex) {
            logger.warn("PayPal.loadLive", ex, "Will try again")

            try {
                await jaul.io.sleep(settings.axios.retryInterval)
                await api.authenticate()
                await loader()
            } catch (innerEx) {
                logger.error("PayPal.loadLive", innerEx)
            }
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

                logger.warn("PayPal.setupProduct", `Found no products matching name: ${productName}`, "Will create a new one")
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
     * plans will be marked as enabled (one for each currency + frequency).
     */
    setupBillingPlans = async () => {
        try {
            const billingPlans = await paypalSubscriptions.getBillingPlans()
            const frequencies = _.intersection(Object.keys(settings.plans.pro.price), ["day", "week", "month", "year"])

            api.currentBillingPlans = {}
            api.legacyBillingPlans = {}

            // Match existing plans by looking for the currency / frequency and price.
            for (let plan of billingPlans) {
                const price = settings.plans.pro.price[plan.frequency]

                if (plan.price == price && settings.paypal.billingPlan.currency.includes(plan.currency)) {
                    api.currentBillingPlans[plan.id] = plan
                } else {
                    api.legacyBillingPlans[plan.id] = plan
                }
            }

            // Make sure we have a billing plan for each currency / frequency defined on the settings.
            // Create new plans as needed.
            for (let frequency of frequencies) {
                const price = settings.plans.pro.price[frequency]

                for (let currency of settings.paypal.billingPlan.currency) {
                    const existing = _.find(api.currentBillingPlans, {price: price, currency: currency, frequency: frequency})

                    if (!existing) {
                        if (settings.beta.enabled) {
                            logger.warn("PayPal.setupBillingPlans", currency, frequency, "New billing plans are disabled on the beta environment, will not create")
                        } else {
                            const newPlan = await paypalSubscriptions.createBillingPlan(api.currentProduct.id, currency, frequency)
                            api.currentBillingPlans[newPlan.id] = newPlan

                            logger.info("PayPal.setupBillingPlans", newPlan.id, newPlan.name, "New!")
                        }
                    } else {
                        logger.info("PayPal.setupBillingPlans", existing.id, existing.name)
                    }
                }
            }

            // Has legacy plans?
            const legacy = Object.keys(api.legacyBillingPlans)
            if (legacy.length > 0) {
                logger.info("PayPal.setupBillingPlans", `Legacy plans: ${legacy.join(", ")}`)
            }
        } catch (ex) {
            logger.error("PayPal.setupBillingPlans", ex)
            throw ex
        }
    }
}

// Exports...
export default PayPal.Instance
