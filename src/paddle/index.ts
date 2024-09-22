// Strautomator Core: Paddle

import {UserData} from "../users/types"
import {Environment, EventName, LogLevel, Paddle, PaddleOptions} from "@paddle/paddle-node-sdk"
import paddleApi from "./api"
import paddleCustomers from "./customers"
import paddlePrices from "./prices"
import paddleSubscriptions from "./subscriptions"
import database from "../database"
import eventManager from "../eventmanager"
import _ from "lodash"
import jaul from "jaul"
import logger from "anyhow"
import * as logHelper from "../loghelper"
const settings = require("setmeup").settings

/**
 * Paddle Wrapper.
 */
export class PaddleWrapper {
    private constructor() {}
    private static _instance: PaddleWrapper
    static get Instance() {
        return this._instance || (this._instance = new this())
    }

    /**
     * Paddle API handler.
     */
    api = paddleApi

    /**
     * Paddle Customers.
     */
    customers = paddleCustomers

    /**
     * Paddle Prices.
     */
    prices = paddlePrices

    /**
     * Paddle Subscriptions.
     */
    subscriptions = paddleSubscriptions

    /**
     * Webhook secret key.
     */
    webhookSecret: string

    // INIT
    // --------------------------------------------------------------------------

    /**
     * Init the Paddle billing and subscription wrapper.
     * @param quickStart If true, will not fetch live config from Paddle.
     */
    init = async (quickStart?: boolean): Promise<void> => {
        try {
            if (!settings.paddle.api.key) {
                throw new Error("Missing the mandatory paddle.api.key setting")
            }
            if (!settings.paddle.webhookId) {
                throw new Error("Missing the mandatory paddle.webhookId setting")
            }

            const isProduction = settings.paddle.api.environment == "production"
            const options: PaddleOptions = {
                environment: isProduction ? Environment.production : Environment.sandbox,
                logLevel: isProduction ? LogLevel.warn : LogLevel.verbose
            }
            this.api.client = new Paddle(settings.paddle.api.key, options)

            await this.loadFromCache()

            // Load live data if quickStart was not set.
            if (!quickStart) {
                await this.loadLive()
            }

            // Unsubscribe when user gets deleted.
            eventManager.on("Users.delete", this.onUserDelete)
        } catch (ex) {
            logger.error("Paddle.init", ex)
            throw ex
        }
    }

    /**
     * Unsubscribe when user gets deleted.
     * @param user User that was deleted from the database.
     */
    private onUserDelete = async (user: UserData): Promise<void> => {
        try {
            if (user.paddleId) {
                await this.subscriptions.cancelSubscription(user)
                logger.info("Paddle.onUserDelete", logHelper.user(user), `Force cancelled the user subscription`)
            }
        } catch (ex) {
            logger.warn("Paddle.onUserDelete", logHelper.user(user), "Failed to cancel user subscription")
        }
    }

    // SETUP
    // --------------------------------------------------------------------------

    /**
     * Load base Paddle details from the database.
     */
    loadFromCache = async (): Promise<void> => {
        try {
            const fromCache = await database.appState.get("paddle")

            if (!fromCache) {
                logger.warn("Paddle.loadFromCache", "No Paddle data found")
                return
            }

            // Set webhook and cached prices.
            this.webhookSecret = fromCache.webhookSecret
            this.prices.yearlyPrice = fromCache.yearlyPrice
            this.prices.lifetimePrice = fromCache.lifetimePrice

            logger.info("Paddle.loadFromCache", "Loaded from the database")
        } catch (ex) {
            logger.error("Paddle.loadFromCache", ex)
        }
    }

    /**
     * Load the live Paddle data.
     */
    loadLive = async (): Promise<void> => {
        try {
            const webhookSettings = await this.api.client.notificationSettings.get(settings.paddle.webhookId)
            this.webhookSecret = webhookSettings.endpointSecretKey
            await this.prices.getPrices()

            const yearly = JSON.parse(JSON.stringify(this.prices.yearlyPrice))
            const lifetime = JSON.parse(JSON.stringify(this.prices.lifetimePrice))
            await database.appState.set("paddle", {yearlyPrice: yearly, lifetimePrice: lifetime, webhookSecret: webhookSettings.endpointSecretKey})

            logger.info("Paddle.loadLive", `Yearly price: ${parseFloat(this.prices.yearlyPrice.unitPrice.amount) / 100}`)
        } catch (ex) {
            logger.warn("Paddle.loadLive", ex)
        }
    }

    // WEBHOOKS
    // --------------------------------------------------------------------------

    /**
     * Process webhook notifications sent by Paddle.
     * @param req The request object.
     */
    processWebhook = async (req: Request): Promise<void> => {
        try {
            const signature = (req.headers["paddle-signature"] as string) || null
            const rawRequestBody = req.body?.toString() || null
            const clientIP = jaul.network.getClientIP(req)

            // Basic validation.
            if (settings.paddle.ips?.length > 0 && !jaul.network.ipInRange(clientIP, settings.paddle.ips)) {
                throw new Error(`Client IP ${clientIP} denied`)
            }
            if (!signature) {
                throw new Error("Missing signature")
            }
            if (!rawRequestBody) {
                throw new Error("Missing request body")
            }

            // Decode the event data.
            const ev = this.api.client.webhooks.unmarshal(rawRequestBody, this.webhookSecret, signature)
            if (!ev) {
                throw new Error("Invalid event signature")
            }

            // Process webhook according to the event type.
            if (ev.eventType == EventName.CustomerUpdated) {
                await this.customers.onCustomerUpdated(ev)
                logger.info("Paddle.processWebhook", ev.eventType, ev.eventId, ev.data.id)
            } else if (ev.eventType == EventName.SubscriptionActivated) {
                await this.subscriptions.onSubscriptionCreated(ev)
                logger.info("Paddle.processWebhook", ev.eventType, ev.eventId, ev.data.id)
            } else if ([EventName.SubscriptionPastDue, EventName.SubscriptionPaused, EventName.SubscriptionResumed, EventName.SubscriptionCanceled].includes(ev.eventType)) {
                await this.subscriptions.onSubscriptionUpdated(ev)
                logger.info("Paddle.processWebhook", ev.eventType, ev.eventId, ev.data.id)
            } else if ([EventName.TransactionCompleted].includes(ev.eventType)) {
                await this.subscriptions.onTransaction(ev)
                logger.info("Paddle.processWebhook", ev.eventType, ev.eventId, ev.data.id)
            } else {
                logger.info("Paddle.processWebhook", ev.eventType, ev.eventId, ev.data.id, "No action taken")
            }
        } catch (ex) {
            logger.error("Paddle.processWebhook", ex)
        }
    }
}

// Exports...
export default PaddleWrapper.Instance
