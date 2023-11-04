// Strautomator Core: PayPal Webhooks

import {PayPalWebhook, PayPalSubscription} from "./types"
import api from "./api"
import database from "../database"
import eventManager from "../eventmanager"
import _ from "lodash"
import logger from "anyhow"
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
            if (settings.beta.enabled) {
                throw new Error("Webhooks cannot be created on the beta environment")
            }

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
            const resource = data ? data.resource : null
            let subscription: PayPalSubscription

            // Invalid resource? Stop here.
            if (!resource) {
                logger.warn("PayPal.processWebhook", data.event_type, "No resource data found")
                return
            }

            // Get and log webhook event details.
            if (resource.id) resourceDetails.push(`ID ${resource.id}`)
            if (resource.plan_id) resourceDetails.push(`Plan ${resource.plan_id}`)
            if (resource.billing_agreement_id) resourceDetails.push(`Subscription ${resource.billing_agreement_id}`)
            if (resource.amount) resourceDetails.push(`${resource.amount.total} ${resource.amount.currency}`)
            if (resource.state) resourceDetails.push(`State: ${resource.state}`)
            if (resource.status) resourceDetails.push(resource.status)
            if (resource.subscriber?.email_address) resourceDetails.push(`Email: ${resource.subscriber.email_address}`)
            logger.info("PayPal.processWebhook", data.event_type, resourceDetails.join(", "))

            // Webhook event referencing a subscription?
            const subscriptionId = resource.billing_agreement_id || resource.id
            if (subscriptionId) {
                subscription = await database.get("subscriptions", subscriptionId)

                // No matching subscription found? Stop here.
                if (!subscription) {
                    logger.warn("PayPal.processWebhook", subscriptionId, "Subscription not found on the database")
                    return
                }

                const dateUpdated = resource.update_time ? dayjs(resource.update_time).toDate() : new Date()
                const updatedSubscription: Partial<PayPalSubscription> = {
                    id: subscription.id,
                    userId: subscription.userId,
                    dateUpdated: dateUpdated
                }

                // Set the current subscription status.
                if (data.event_type == "PAYMENT.SALE.COMPLETED") {
                    subscription.status = "ACTIVE"
                } else if (data.event_type == "BILLING.SUBSCRIPTION.CANCELLED") {
                    subscription.status = "CANCELLED"
                } else if (data.event_type == "BILLING.SUBSCRIPTION.EXPIRED") {
                    subscription.status = "EXPIRED"
                } else if (data.event_type == "BILLING.SUBSCRIPTION.SUSPENDED" || data.event_type == "PAYMENT.SALE.REVERSED") {
                    subscription.status = "SUSPENDED"
                }
                updatedSubscription.status = subscription.status

                // Email present on subscription details?
                if (resource.subscriber && resource.subscriber.email_address) {
                    subscription.email = resource.subscriber.email_address
                    updatedSubscription.email = subscription.email
                }

                // Payment data present on subscription details?
                if (subscription.status == "ACTIVE" && resource.amount?.total) {
                    subscription.lastPayment = {
                        amount: resource.amount.total,
                        currency: resource.amount.currency,
                        date: dateUpdated
                    }
                    updatedSubscription.lastPayment = subscription.lastPayment
                }

                // Save updated subscription on the database, and emit event to update the user.
                await database.merge("subscriptions", updatedSubscription)
                eventManager.emit("PayPal.subscriptionUpdated", subscription)
            }
        } catch (ex) {
            logger.error("PayPal.processWebhook", `ID ${data.id}`, data.event_type, ex)
        }
    }
}

// Exports...
export default PayPalWebhooks.Instance
