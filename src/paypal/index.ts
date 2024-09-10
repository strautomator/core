// Strautomator Core: PayPal

import {PayPalBillingPlan, PayPalProduct} from "./types"
import {UserData} from "../users/types"
import api from "./api"
import database from "../database"
import eventManager from "../eventmanager"
import subscriptions from "../subscriptions"
import paypalProducts from "./products"
import paypalSubscriptions from "./subscriptions"
import paypalWebhooks from "./webhooks"
import _ from "lodash"
import jaul from "jaul"
import logger from "anyhow"
import dayjs from "../dayjs"
import * as logHelper from "../loghelper"
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
            const userSubs = await subscriptions.getByUser(user)
            const userPayPalSubs = _.filter(userSubs, {source: "paypal"})

            // Iterate and try to cancel all pending PayPal subscriptions.
            for (let s of userPayPalSubs) {
                try {
                    const subscription = await paypalSubscriptions.getSubscription(s.id)

                    if (subscription) {
                        subscription.userId = user.id
                        await paypalSubscriptions.cancelSubscription(subscription)
                    }
                } catch (innerEx) {
                    logger.warn("PayPal.onUserDelete", logHelper.user(user), `Failed to cancel subscription ${s.id}`)
                }
            }
        } catch (ex) {
            logger.warn("PayPal.onUserDelete", logHelper.user(user), "Failed to cancel user subscription")
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
        try {
            const authenticated = await api.authenticate()

            if (authenticated) {
            } else if (api.auth.expiresAt <= dayjs().unix()) {
                throw new Error("PayPal authentication failed")
            }
        } catch (ex) {
            logger.warn("PayPal.loadLive", ex, "Will try again")

            try {
                await jaul.io.sleep(settings.axios.retryInterval)
                await api.authenticate()
            } catch (innerEx) {
                logger.error("PayPal.loadLive", innerEx)
            }
        }
    }
}

// Exports...
export default PayPal.Instance
