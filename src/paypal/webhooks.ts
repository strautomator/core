// Strautomator Core: PayPal Webhooks

import {PayPalWebhook, PayPalSubscription} from "./types"
import api from "./api"
import database from "../database"
import eventManager from "../eventmanager"
import subscriptions from "../subscriptions"
import _ from "lodash"
import logger from "anyhow"
import * as logHelper from "../loghelper"
import dayjs from "../dayjs"
const settings = require("setmeup").settings

/**
 * PayPal Webhooks API.
 */
export class PayPalWebhooks {
    private constructor() {}
    private static _instance: PayPalWebhooks
    static get Instance() {
        return this._instance || (this._instance = new this())
    }

    // WEBHOOK METHODS
    // --------------------------------------------------------------------------

    /**
     * Get list of registered webhooks.
     */
    getWebhooks = async (): Promise<PayPalWebhook[]> => {
        try {
            const options = {
                url: "notifications/webhooks",
                returnRepresentation: true
            }

            const res = await api.makeRequest(options)

            // No webhooks yet?
            if (!res.webhooks || res.webhooks.length == 0) {
                logger.warn("PayPal.getWebhooks", "No webhooks returned from PayPal")
                return []
            }

            logger.info("PayPal.getWebhooks", `Got ${res.webhooks.length}`, _.map(res.webhooks, "id").join(", "))

            return res.webhooks
        } catch (ex) {
            logger.error("PayPal.getWebhooks", "Could not fetch webhooks from PayPal")
            throw ex
        }
    }

    /**
     * Register a new webhook on PayPal.
     */
    createWebhook = async (): Promise<PayPalWebhook> => {
        try {
            const options = {
                url: "notifications/webhooks",
                method: "POST",
                returnRepresentation: true,
                data: {
                    url: api.webhookUrl,
                    event_types: settings.paypal.api.webhookEvents
                }
            }

            const res = await api.makeRequest(options)

            // Make sure response has a valid ID.
            if (!res || !res.id) {
                throw new Error("Invalid response from PayPal")
            }

            logger.info("PayPal.createWebhook", `New webhook ID: ${res.id}`)

            return {
                id: res.id,
                url: res.url
            }
        } catch (ex) {
            logger.error("PayPal.createWebhook", "Could not register a new webhook on PayPal")
            throw ex
        }
    }

    /**
     * Get details about a webhook event.
     * @param id The event ID.
     */
    getWebhookEventDetails = async (id: string): Promise<any> => {
        try {
            const options = {
                url: `notifications/webhooks-events/${id}`
            }

            const res = await api.makeRequest(options)

            logger.info("PayPal.getWebhookEventDetails", id, res.event_type, res.resource.id, `Created ${res.create_time}`)

            return res
        } catch (ex) {
            logger.error("PayPal.getWebhookEventDetails", "Could not fetch products from PayPal")
            throw ex
        }
    }

    /**
     * Process a webhook event dispatched by PayPal.
     * @param data Event data.
     * @event PayPal.subscriptionUpdated
     */
    processWebhook = async (data: any): Promise<void> => {
        try {
            const resourceDetails = []
            const res = data ? data.resource : null

            // Invalid resource? Stop here.
            if (!res) {
                logger.warn("PayPal.processWebhook", data.event_type, "No resource data found")
                return
            }

            // Get and log webhook event details.
            if (res.id) resourceDetails.push(`ID ${res.id}`)
            if (res.plan_id) resourceDetails.push(`Plan ${res.plan_id}`)
            if (res.billing_agreement_id) resourceDetails.push(`Subscription ${res.billing_agreement_id}`)
            if (res.amount) resourceDetails.push(`${res.amount.total} ${res.amount.currency}`)
            if (res.state) resourceDetails.push(`State: ${res.state}`)
            if (res.status) resourceDetails.push(res.status)
            if (res.subscriber?.email_address) resourceDetails.push(`Email: ${res.subscriber.email_address}`)
            logger.info("PayPal.processWebhook", data.event_type, resourceDetails.join(", "))

            // Webhook event referencing a subscription?
            const subscriptionId = res.billing_agreement_id || res.id
            if (subscriptionId) {
                let subscription: PayPalSubscription = await database.get("subscriptions", subscriptionId)

                // No matching subscription found? Stop here.
                if (!subscription) {
                    logger.warn("PayPal.processWebhook", subscriptionId, "Subscription not found on the database")
                    return
                }

                const dateUpdated = res.update_time ? dayjs.utc(res.update_time).toDate() : dayjs.utc().toDate()
                const updatedSubscription: Partial<PayPalSubscription> = {
                    source: "paypal",
                    id: subscription.id,
                    userId: subscription.userId,
                    dateUpdated: dateUpdated
                }

                // Set the current subscription status.
                if (data.event_type == "PAYMENT.SALE.COMPLETED") {
                    subscription.status = "ACTIVE"
                    if (subscription.frequency && subscription.dateExpiry) {
                        const logExpiry = dayjs.utc(subscription.dateExpiry).format("ll")
                        logger.warn("PayPal.processWebhook", logHelper.subscriptionUser(subscription), `Expiry date: ${logExpiry}, probably should not have one`)
                    }
                } else if (data.event_type == "BILLING.SUBSCRIPTION.CANCELLED") {
                    subscription.status = "CANCELLED"
                } else if (data.event_type == "BILLING.SUBSCRIPTION.EXPIRED") {
                    subscription.status = "EXPIRED"
                } else if (data.event_type == "BILLING.SUBSCRIPTION.SUSPENDED" || data.event_type == "PAYMENT.SALE.REVERSED") {
                    subscription.status = "SUSPENDED"
                }
                updatedSubscription.status = subscription.status

                // Email present on subscription details?
                if (res.subscriber && res.subscriber.email_address) {
                    subscription.email = res.subscriber.email_address
                    updatedSubscription.email = subscription.email
                }

                // Payment data present on subscription details?
                if (subscription.status == "ACTIVE") {
                    if (res.amount?.total) {
                        subscription.lastPayment = {
                            amount: res.amount.total,
                            currency: res.amount.currency,
                            date: dateUpdated
                        }
                        updatedSubscription.lastPayment = subscription.lastPayment
                    }
                    if (res.billing_info?.next_billing_time) {
                        subscription.dateNextPayment = dayjs.utc(res.billing_info.next_billing_time).toDate()
                        updatedSubscription.dateNextPayment = subscription.dateNextPayment
                    }
                }

                // Save updated subscription on the database, and emit event to update the user.
                await subscriptions.update(updatedSubscription)
                eventManager.emit("PayPal.subscriptionUpdated", subscription)
            }
        } catch (ex) {
            logger.error("PayPal.processWebhook", `ID ${data.id}`, data.event_type, ex)
        }
    }
}

// Exports...
export default PayPalWebhooks.Instance
