// Strautomator Core: PayPal Subscriptions

import {PayPalBillingPlan, PayPalSubscription} from "./types"
import api from "./api"
import eventManager from "../eventmanager"
import subscriptions from "../subscriptions"
import _ from "lodash"
import logger from "anyhow"
import dayjs from "../dayjs"
const settings = require("setmeup").settings

/**
 * PayPal Subscriptions API.
 */
export class PayPalSubscriptions {
    private constructor() {}
    private static _instance: PayPalSubscriptions
    static get Instance() {
        return this._instance || (this._instance = new this())
    }

    // BILLING PLAN METHODS
    // --------------------------------------------------------------------------

    /**
     * Return billing plans registered on PayPal.
     * @param productId Optional product ID.
     * @param activeOnly Set to true to return all billing plans instead of only active ones.
     */
    getBillingPlans = async (productId?: string, returnAll?: boolean): Promise<PayPalBillingPlan[]> => {
        try {
            const plans: PayPalBillingPlan[] = []
            const options: any = {
                url: "billing/plans",
                params: {
                    page: 1,
                    page_size: 20
                }
            }

            if (productId) {
                options.params.product_id = productId
            } else {
                productId = null
            }

            const res = await api.makeRequest(options)

            // No plans returned from PayPal? Stop here.
            if (!res.plans || res.plans.length == 0) {
                logger.warn("PayPal.getBillingPlans", `Product ${productId}`, "No billing plans returned from PayPal")
                return []
            }

            // Iterate response and get plan details.
            for (let p of res.plans) {
                if (returnAll || p.status == "ACTIVE") {
                    plans.push(await this.getBillingPlan(p.id))
                }
            }

            // Log parameters.
            const logProduct = productId ? " for product ${productId}" : ""
            const logStatus = returnAll ? "all" : "active only"
            logger.info("PayPal.getBillingPlans", `Status: ${logStatus}`, `Got ${plans.length} plans${logProduct}`)

            return plans
        } catch (ex) {
            logger.error("PayPal.getBillingPlans", `Could not fetch billing plans for product ${productId}`)
            throw ex
        }
    }

    /**
     * Return full details about a single billing plan.
     * @param id The billing plan ID.
     */
    getBillingPlan = async (id: string): Promise<PayPalBillingPlan> => {
        try {
            const options: any = {
                url: `billing/plans/${id}`,
                returnRepresentation: true
            }

            const res = await api.makeRequest(options)

            // No data returned from PayPal? Stop here.
            if (!res.id) {
                logger.warn("PayPal.getBillingPlan", id, "No plan details returned from PayPal")
                return null
            }

            const billingPlan: PayPalBillingPlan = {
                id: res.id,
                productId: res.product_id,
                name: res.name,
                dateCreated: dayjs.utc(res.create_time).toDate(),
                price: parseFloat(res.billing_cycles[0].pricing_scheme.fixed_price.value),
                currency: res.billing_cycles[0].pricing_scheme.fixed_price.currency_code,
                frequency: res.billing_cycles[0].frequency.interval_unit.toLowerCase(),
                enabled: false
            }

            // Plan is enabled only if matching the current product ID , frequency and price.
            const matchingProduct = api.currentProduct && api.currentProduct.id == billingPlan.productId
            if (matchingProduct) {
                billingPlan.enabled = true
            }

            return billingPlan
        } catch (ex) {
            logger.error("PayPal.getBillingPlan", `Could not fetch billing plans for product ${id}`)
            throw ex
        }
    }

    // SUBSCRIPTION METHODS
    // --------------------------------------------------------------------------

    /**
     * Get subscription details from PayPal.
     * @param id The corresponding subscription ID.
     */
    getSubscription = async (id: string): Promise<PayPalSubscription> => {
        try {
            const options = {
                url: `billing/subscriptions/${id}`,
                returnRepresentation: true
            }

            const res = await api.makeRequest(options)

            // No data returned from PayPal? Stop here.
            if (!res.id) {
                logger.warn("PayPal.getSubscription", `Response for subscription ${id} has an invalid payload`)
                return null
            }

            // Create subscription object with the fetched details.
            const subscription: PayPalSubscription = {
                source: "paypal",
                id: res.id,
                userId: null,
                status: res.status,
                billingPlan: api.currentBillingPlans[res.plan_id] || ({id: res.plan_id} as PayPalBillingPlan),
                dateCreated: dayjs.utc(res.create_time).toDate(),
                dateUpdated: dayjs.utc(res.update_time).toDate()
            }

            // Has email assigned?
            if (res.subscriber && res.subscriber.email_address) {
                subscription.email = res.subscriber.email_address
            }

            // Still needs to be approved?
            const approvalLink = _.find(res.links, {rel: "approve"})
            if (approvalLink) {
                subscription.approvalUrl = approvalLink.href
            }

            // Payment info available?
            if (res.billing_info) {
                if (res.billing_info.next_billing_time) {
                    subscription.dateNextPayment = dayjs.utc(res.billing_info.next_billing_time).toDate()
                }

                // A payment was already made? Fill last payment details.
                if (res.billing_info.last_payment) {
                    subscription.dateLastPayment = dayjs.utc(res.billing_info.last_payment.time).toDate()
                }
            }

            logger.info("PayPal.getSubscription", id, `Plan ${res.plan_id}`, `Last updated ${dayjs.utc(subscription.dateUpdated).format("lll")}`)

            return subscription
        } catch (ex) {
            if (ex.response && ex.response.status == 404) {
                logger.warn("PayPal.getSubscription", `Subscription ${id} not found`)
                return null
            }

            logger.error("PayPal.getSubscription", `Could not fetch details for subscription ${id}`)
            throw ex
        }
    }

    /**
     * Create a new subscription agreement for the specified billing plan.
     * @param billingPlan The billing plan chosen by the user.
     * @event PayPal.subscriptionCreated
     */
    createSubscription = async (billingPlan: PayPalBillingPlan, userId: string): Promise<PayPalSubscription> => {
        try {
            const options = {
                url: "billing/subscriptions",
                method: "POST",
                returnRepresentation: true,
                data: {
                    plan_id: billingPlan.id,
                    custom_id: userId,
                    start_date: dayjs.utc().add(settings.paypal.billingPlan.startMinutes, "minute").format("gggg-MM-DDTHH:mm:ss") + "Z",
                    application_context: {
                        brand_name: settings.app.title,
                        return_url: `${settings.app.url}billing/success`,
                        cancel_url: `${settings.app.url}billing`,
                        shipping_preference: "NO_SHIPPING",
                        payment_method: {
                            payer_selected: "PAYPAL",
                            payee_preferred: "IMMEDIATE_PAYMENT_REQUIRED"
                        }
                    }
                }
            }

            const res = await api.makeRequest(options)

            // Make sure response has a valid ID.
            if (!res || !res.id) {
                throw new Error("Invalid response from PayPal")
            }

            // Create subscription and save on the database.
            const subscription: PayPalSubscription = {
                source: "paypal",
                id: res.id,
                userId: userId,
                status: res.status,
                dateCreated: dayjs.utc(res.create_time).toDate(),
                approvalUrl: _.find(res.links, {rel: "approve"}).href,
                billingPlan: {id: billingPlan.id, productId: billingPlan.productId}
            }

            // Save to the database.
            await subscriptions.create(subscription)

            logger.info("PayPal.createSubscription", `User ${userId}, plan ${billingPlan.id}`, `Created: ${subscription.id}`)
            eventManager.emit("PayPal.subscriptionCreated", subscription)

            return subscription
        } catch (ex) {
            logger.error("PayPal.createSubscription", `Could not create subscription for user ${userId}, plan ${billingPlan.id}`)
            throw ex
        }
    }

    /**
     * Cancel the specified subscription.
     * @param subscription The subscription to be cancelled.
     */
    cancelSubscription = async (subscription: PayPalSubscription, reason?: string): Promise<void> => {
        subscription.status = "CANCELLED"
        subscription.dateUpdated = dayjs.utc().toDate()

        try {
            const options = {
                url: `billing/subscriptions/${subscription.id}/cancel`,
                method: "POST",
                data: {
                    reason: reason
                }
            }

            // Cancel subscription on PayPal. No need to save to the database, as it will be done automatically via webhooks
            // when PayPal confirms that the subscription was cancelled.
            await api.makeRequest(options)
        } catch (ex) {
            if (ex.message && ex.message.includes("SUBSCRIPTION_STATUS_INVALID")) {
                logger.warn("PayPal.cancelSubscription", subscription.id, `User ${subscription.userId} - ${subscription.email}`, "Subscription not active, can't cancel")
            } else {
                logger.error("PayPal.cancelSubscription", subscription.id, `User ${subscription.userId} - ${subscription.email}`, "Could not cancel")
                throw ex
            }
        }
    }
}

// Exports...
export default PayPalSubscriptions.Instance
