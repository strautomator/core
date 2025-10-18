// Strautomator Core: Strava Webhooks

import {StravaWebhook} from "./types"
import api from "./api"
import logger from "anyhow"
import dayjs from "../dayjs"
const settings = require("setmeup").settings

/**
 * Strava webhooks manager.
 */
export class StravaWebhooks {
    private constructor() {}
    private static _instance: StravaWebhooks
    static get Instance(): StravaWebhooks {
        return this._instance || (this._instance = new this())
    }

    /**
     * Copy of current webhook registered on Strava.
     */
    current: StravaWebhook = null

    /**
     * The expected callback URL to be registered on Strava.
     */
    get callbackUrl(): string {
        const baseUrl = settings.api.url || `${settings.app.url}api/`
        return `${baseUrl}strava/webhook/${settings.strava.api.urlToken}`
    }

    // GET WEBHOOKS
    // --------------------------------------------------------------------------

    /**
     * Check a subscription status based on its ID.
     */
    getWebhook = async (): Promise<StravaWebhook> => {
        try {
            const query = {
                client_id: settings.strava.api.clientId,
                client_secret: settings.strava.api.clientSecret
            }

            const result = await api.get(null, `push_subscriptions`, query)

            // No webhooks registered? Return null then.
            if (result.length == 0) {
                logger.info("Strava.getWebhook", "No webhook registered on Strava")
                return null
            }

            // Build result.
            const data = result[0]
            const webhook: StravaWebhook = {
                id: data.id,
                callbackUrl: data.callback_url,
                dateUpdated: dayjs.utc(data.updated_at).toDate()
            }

            // Set as current webhook.
            this.current = webhook
            logger.info("Strava.getWebhook", `ID ${webhook.id}`, webhook.callbackUrl)

            return webhook
        } catch (ex) {
            logger.error("Strava.getWebhook", ex)
            throw ex
        }
    }

    // SET WEBHOOKS
    // --------------------------------------------------------------------------

    /**
     * Subscribe to activities updates sent by Strava.
     */
    createWebhook = async (): Promise<void> => {
        try {
            const query = {
                callback_url: this.callbackUrl,
                client_id: settings.strava.api.clientId,
                client_secret: settings.strava.api.clientSecret,
                verify_token: settings.strava.api.verifyToken
            }

            const result = await api.post(null, "push_subscriptions", query)

            // Make sure a valid response was sent by Strava.
            if (!result.id) {
                throw new Error("Missing subscription ID from Strava")
            }

            // Set as current.
            this.current = {
                id: result.id,
                callbackUrl: this.callbackUrl,
                dateUpdated: dayjs.utc().toDate()
            }

            logger.info("Strava.createWebhook", `ID ${result.id}`, this.callbackUrl)
        } catch (ex) {
            if (JSON.stringify(ex, null, 0).includes("already exists")) {
                logger.warn("Strava.createWebhook", "Webhook subscription already exists, will try getting it again")

                try {
                    await this.getWebhook()
                    return
                } catch (innerEx) {
                    logger.error("Strava.createWebhook", "Failed to get existing webhook subscription", ex)
                    throw ex
                }
            }

            if (ex.response?.data?.errors) {
                logger.error("Strava.createWebhook", ex, ex.response.data.errors[0])
            } else {
                logger.error("Strava.createWebhook", ex)
            }

            throw ex
        }
    }

    /**
     * Cancel a subscription (mostly called when user cancel the account).
     * It won't trigger if there's no current webhook registered on Strava.
     */
    cancelWebhook = async (): Promise<void> => {
        try {
            if (!this.current) {
                logger.warn("Strava.cancelWebhook", "No webhook to cancel on Strava")
                return
            }

            const query = {
                client_id: settings.strava.api.clientId,
                client_secret: settings.strava.api.clientSecret
            }

            await api.delete(null, `push_subscriptions/${this.current.id}`, query)
            logger.info("Strava.cancelWebhook", `Subscription ${this.current.id} cancelled`)

            this.current = null
        } catch (ex) {
            if (ex.response && ex.response.data && ex.response.data.errors) {
                logger.error("Strava.cancelWebhook", ex, ex.response.data.errors[0])
            } else {
                logger.error("Strava.cancelWebhook", ex)
            }

            throw ex
        }
    }
}

// Exports...
export default StravaWebhooks.Instance
