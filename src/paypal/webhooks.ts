// Strautomator Core: PayPal Webhooks

import {PayPalWebhook, PayPalSubscription} from "./types"
import api from "./api"
import database from "../database"
import eventManager from "../eventmanager"
import _ = require("lodash")
import logger = require("anyhow")
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
     * Registr a new webhook on PayPal.
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
    processWebhook = async (data): Promise<void> => {
        try {
            const resourceDetails = []
            const resource = data.resource
            let subscription: PayPalSubscription

            // Get and log webhook event details.
            if (resource) {
                if (resource.id) resourceDetails.push(`ID ${resource.id}`)
                if (resource.plan_id) resourceDetails.push(`Plan ${resource.id}`)
                if (resource.billing_agreement_id) resourceDetails.push(`Subscription ${resource.billing_agreement_id}`)
                if (resource.amount) resourceDetails.push(`${resource.amount.total} ${resource.amount.currency}`)
                if (resource.state) resourceDetails.push(`State: ${resource.state}`)
                if (resource.status) resourceDetails.push(resource.status)

                // EUser email present on event?
                if (resource.subscriber && resource.subscriber.email_address) resourceDetails.push(`Email: ${resource.subscriber.email_address}`)
            } else {
                resourceDetails.push("No resource details found")
            }

            logger.info("PayPal.processWebhook", data.event_type, resourceDetails.join(", "))

            // Webhook event referencing a subscription?
            if (resource.billing_agreement_id) {
                subscription = await database.get("subscriptions", resource.billing_agreement_id)

                // Oops... event for a subscription that was not saved on the database?
                if (!subscription) {
                    const msg = `Payment of ${resource.amount.total} ${resource.amount.currency} for subscription ${resource.billing_agreement_id}, but subscription was not found on the database.`
                    eventManager.emit("Admin.alert", msg, `Payment for invalid subscription ${resource.billing_agreement_id}`)
                    return
                }

                // User just activated (yay!) or cancelled (oh no!) a subscription?
                if (data.event_type == "PAYMENT.SALE.COMPLETED") {
                    subscription.status = "ACTIVE"
                } else if (data.event_type == "BILLING.SUBSCRIPTION.CANCELLED") {
                    subscription.status = "CANCELLED"
                }

                // Save updated subscription on the database, and emit event to update the user.
                await database.merge("subscriptions", {id: subscription.id, status: subscription.status, date: subscription.dateUpdated})
                eventManager.emit("PayPal.subscriptionUpdated", subscription)
            }
        } catch (ex) {
            logger.error("PayPal.processWebhook", `ID ${data.id}`, data.event_type, ex)
        }
    }
}

// Exports...
export default PayPalWebhooks.Instance
