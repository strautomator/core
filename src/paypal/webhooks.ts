// Strautomator Core: PayPal Webhooks

import {PayPalWebhook} from "./types"
import api from "./api"
import _ = require("lodash")
import logger = require("anyhow")
const settings = require("setmeup").settings

/**
 * PayPal Webhooks API.
 */
export class PayPalProducts {
    private constructor() {}
    private static _instance: PayPalProducts
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
    getEventDetails = async (id: string): Promise<any> => {
        try {
            const options = {
                url: `notifications/webhooks-events/${id}`
            }

            const res = await api.makeRequest(options)

            logger.info("PayPal.getEventDetails", id, res.event_type, res.resource.id, `Created ${res.create_time}`)

            return res
        } catch (ex) {
            logger.error("PayPal.getEventDetails", "Could not fetch products from PayPal")
            throw ex
        }
    }
}

// Exports...
export default PayPalProducts.Instance
