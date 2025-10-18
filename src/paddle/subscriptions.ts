// Strautomator Core: Paddle Customers

import {EventEntity, Subscription, SubscriptionNotification, Transaction, TransactionNotification} from "@paddle/paddle-node-sdk"
import {FieldValue} from "@google-cloud/firestore"
import {PaddleSubscription} from "./types"
import {UserData} from "../users/types"
import api from "./api"
import paddlePrices from "./prices"
import eventManager from "../eventmanager"
import subscriptions from "../subscriptions"
import users from "../users"
import _ from "lodash"
import logger from "anyhow"
import dayjs from "../dayjs"
import * as logHelper from "../loghelper"
const settings = require("setmeup").settings

/**
 * Paddle Subscriptions.
 */
export class PaddleSubscriptions {
    private constructor() {}
    private static _instance: PaddleSubscriptions
    static get Instance() {
        return this._instance || (this._instance = new this())
    }

    /**
     * Helper to set the last and next payment dates.
     * @param sub Subscription to be updated.
     * @param data The webhook notification data.
     */
    private setPaymentDates = async (sub: Partial<PaddleSubscription>, data: SubscriptionNotification): Promise<boolean> => {
        let hasChanges = false
        let lastPayment: dayjs.Dayjs
        let nextPayment: dayjs.Dayjs

        // Set last and next payment dates.
        if (data.currentBillingPeriod?.startsAt) {
            lastPayment = dayjs(data.currentBillingPeriod.startsAt)
        }
        if (data.nextBilledAt) {
            nextPayment = dayjs(data.nextBilledAt)
        } else if (data.currentBillingPeriod?.endsAt) {
            nextPayment = dayjs(data.currentBillingPeriod.endsAt)
        }
        if (lastPayment && (!sub.dateLastPayment || lastPayment.diff(sub.dateLastPayment, "hours") > 1)) {
            sub.dateLastPayment = lastPayment.toDate()
            hasChanges = true
        }
        if (nextPayment && (!sub.dateNextPayment || nextPayment.diff(sub.dateNextPayment, "hours") > 1)) {
            sub.dateNextPayment = nextPayment.toDate()
            hasChanges = true
        }

        // Scheduled to be cancelled in the future? Remove the next payment date.
        if (data.scheduledChange?.action) {
            const effectiveDate = dayjs(data.scheduledChange.effectiveAt).format("ll")
            logger.info("Paddle.onSubscriptionUpdated", logHelper.subscription(sub as PaddleSubscription), `Scheduled change: ${data.scheduledChange.action} on ${effectiveDate}`)
            if (sub.dateNextPayment) {
                sub.dateNextPayment = FieldValue.delete() as any
                hasChanges = true
            }
        }

        return hasChanges
    }

    /**
     * Create a matching subscription when it gets activated by Paddle.
     * @param entity Subscription notification.
     * @param lifetime Is it a lifetime subscription?
     */
    onSubscriptionCreated = async (entity: EventEntity, lifetime?: boolean): Promise<PaddleSubscription> => {
        const data = entity.data as SubscriptionNotification

        try {
            const customData = entity.data as any
            const userId = customData?.userId || null

            let user = await users.getByPaddleId(data.customerId)
            if (!user && userId) {
                logger.warn("Paddle.onSubscriptionCreated", logHelper.paddleEvent(entity), `Customer ${data.customerId} not found, will try to find by user ID ${userId}`)
                user = await users.getById(userId)
            }
            if (!user) {
                throw new Error(`User ${data.customerId || userId} not found`)
            }

            // Required fields.
            const sub: PaddleSubscription = {
                source: "paddle",
                id: data.id,
                userId: user.id,
                customerId: data.customerId,
                status: !lifetime && data.status != "active" ? "APPROVAL_PENDING" : "ACTIVE",
                currency: data.currencyCode,
                dateCreated: dayjs(data.createdAt || new Date()).toDate(),
                dateUpdated: dayjs(data.updatedAt || new Date()).toDate()
            }

            if (data.items?.at(0)?.price?.unitPrice) {
                sub.price = parseFloat(data.items.at(0)?.price?.unitPrice.amount) / 100
            }

            if (lifetime) {
                sub.frequency = "lifetime"
                sub.dateLastPayment = sub.dateUpdated
            } else if (data.billingCycle) {
                sub.frequency = data.billingCycle.interval == "month" ? "monthly" : "yearly"
                this.setPaymentDates(sub, data)
            }

            // Save to the database.
            await subscriptions.create(sub)
            eventManager.emit("Paddle.subscriptionCreated", sub)

            return sub
        } catch (ex) {
            logger.error("Paddle.onSubscriptionCreated", logHelper.paddleEvent(entity), ex)
            return null
        }
    }

    /**
     * Update subscription status.
     * @param entity Subscription notification.
     */
    onSubscriptionUpdated = async (entity: EventEntity): Promise<PaddleSubscription> => {
        const data = entity.data as SubscriptionNotification

        try {
            const customData = entity.data as any
            const userId = customData?.userId || null

            let user = await users.getByPaddleId(data.customerId)
            if (!user && userId) {
                logger.warn("Paddle.onSubscriptionUpdated", logHelper.paddleEvent(entity), `Customer ${data.customerId} not found, will try to find by user ID ${userId}`)
                user = await users.getById(userId)
            }
            if (!user) {
                throw new Error(`User with Paddle ID ${data.customerId} not found`)
            }

            // Make sure the subscription was previously created.
            let sub = (await subscriptions.getById(data.id)) as PaddleSubscription
            if (!sub) {
                logger.warn("Paddle.onSubscriptionUpdated", logHelper.paddleEvent(entity), "Subscription not found, will create it now")
                sub = await this.onSubscriptionCreated(entity)
            }
            if (!sub) {
                throw new Error("Failed to create subscription being updated")
            }

            let hasChanges = false
            const updatedSub: Partial<PaddleSubscription> = {
                id: sub.id,
                userId: sub.userId,
                dateUpdated: dayjs(data.updatedAt || sub.dateUpdated).toDate()
            }

            // Check status updates and payment dates.
            const status = data.status == "active" ? "ACTIVE" : data.status == "paused" || data.status == "past_due" ? "SUSPENDED" : "CANCELLED"
            if (status != sub.status) {
                updatedSub.status = status
                hasChanges = true
            }
            if (this.setPaymentDates(updatedSub, data)) {
                hasChanges = true
            }

            _.assign(sub, updatedSub)

            // Save to the database.
            if (hasChanges) {
                await subscriptions.update(updatedSub)
                eventManager.emit("Paddle.subscriptionUpdated", sub)
            }
            return sub
        } catch (ex) {
            logger.error("Paddle.onSubscriptionUpdated", logHelper.paddleEvent(entity), ex)
            return null
        }
    }

    /**
     * Update subscription once a transaction has been made.
     * @param entity Transaction notification.
     */
    onTransaction = async (entity: EventEntity): Promise<PaddleSubscription> => {
        const data = entity.data as TransactionNotification

        try {
            const customData = entity.data as any
            const userId = customData?.userId || null

            let user = await users.getByPaddleId(data.customerId)
            if (!user && userId) {
                logger.warn("Paddle.onTransaction", logHelper.paddleEvent(entity), `Customer ${data.customerId} not found, will try to find by user ID ${userId}`)
                user = await users.getById(userId)
            }
            if (!user) {
                throw new Error(`User ${data.customerId || userId} not found`)
            }

            // Is it a single time payment for a lifetime subscription?
            let sub: PaddleSubscription
            if (!data.subscriptionId && paddlePrices.lifetimePrice?.id) {
                const price = data.items.find((i) => i.price.id == paddlePrices.lifetimePrice.id)
                if (price) {
                    sub = await this.onSubscriptionCreated(entity, true)
                }
            } else {
                sub = await subscriptions.getById(data.subscriptionId)
            }

            // Make sure the subscription was previously created. If we can't find, try checking by user ID.
            if (!sub && user.subscriptionId) {
                logger.warn("Paddle.onTransaction", logHelper.paddleEvent(entity), `Subscription ${data.subscriptionId} not found, trying ${user.subscriptionId} instead`)
                sub = await subscriptions.getById(user.subscriptionId)
            }
            if (!sub) {
                throw new Error(`Subscription ${data.subscriptionId} not found`)
            }

            let hasChanges = false
            const updatedSub: Partial<PaddleSubscription> = {
                id: sub.id,
                userId: sub.userId,
                dateUpdated: dayjs(data.updatedAt || sub.dateUpdated).toDate()
            }

            // Update price details when needed.
            if (data.details?.totals) {
                const price = parseFloat(data.details.totals.total) / 100
                if (price != sub.price) {
                    updatedSub.price = price
                    hasChanges = true
                }

                const discount = parseFloat(data.details.totals.discount) / 100
                if (discount != sub.discount) {
                    updatedSub.discount = discount > 0 ? discount : (FieldValue.delete() as any)
                    hasChanges = true
                }

                const tax = parseFloat(data.details.totals.tax) / 100
                if (tax != sub.tax) {
                    updatedSub.tax = tax > 0 ? tax : (FieldValue.delete() as any)
                    hasChanges = true
                }
            }

            // Set last and next payment dates.
            if (data.status == "completed") {
                const lastPayment = data.billedAt ? dayjs(data.billedAt) : null
                if (lastPayment && (!sub.dateLastPayment || lastPayment.diff(sub.dateLastPayment, "hours") > 1)) {
                    updatedSub.dateLastPayment = lastPayment.toDate()
                    hasChanges = true
                }
                const nextPayment = data.billingPeriod?.endsAt ? dayjs(data.billingPeriod.endsAt) : null
                if (nextPayment && (!sub.dateNextPayment || nextPayment.diff(sub.dateNextPayment, "hours") > 1)) {
                    updatedSub.dateNextPayment = nextPayment.toDate()
                    hasChanges = true
                }
            }

            _.assign(sub, updatedSub)

            // Save to the database.
            if (hasChanges) {
                await subscriptions.update(updatedSub)
                eventManager.emit("Paddle.onTransaction", sub)
            }
            return sub
        } catch (ex) {
            logger.error("Paddle.onTransaction", logHelper.paddleEvent(entity), ex)
            return null
        }
    }

    // METHODS
    // --------------------------------------------------------------------------

    /**
     * Get subscriptions from Paddle.
     */
    getSubscriptions = async (): Promise<Subscription[]> => {
        try {
            const result: Subscription[] = []

            let res = api.client.subscriptions.list({perPage: settings.paddle.api.pageSize})
            let page = await res.next()
            result.push(...page)

            // Keep fetching while more pages are available.
            while (res.hasMore) {
                page = await res.next()
                result.push(...page)
            }

            logger.info("Paddle.getSubscriptions", `Got ${result.length} subscriptions`)
            return result
        } catch (ex) {
            logger.error("Paddle.getSubscriptions", ex)
            throw ex
        }
    }

    /**
     * Get the subscription details based on ID or user.
     * @param idOrUser The subscription / transaction ID or user data.
     */
    getSubscription = async (idOrUser: string | UserData): Promise<Subscription | Transaction> => {
        const logDetails = _.isString(idOrUser) ? idOrUser : logHelper.user(idOrUser)

        try {
            let result: Subscription | Transaction

            if (_.isString(idOrUser)) {
                if (idOrUser.substring(0, 4) == "txn_") {
                    result = await api.client.transactions.get(idOrUser)
                } else {
                    result = await api.client.subscriptions.get(idOrUser)
                }
            } else {
                const sList = api.client.subscriptions.list({perPage: settings.paddle.api.pageSize, customerId: [idOrUser.paddleId]})
                const sPage = await sList.next()
                if (sPage.length > 0) {
                    result = _.sortBy(sPage, "updatedAt").pop()
                } else {
                    const tList = api.client.transactions.list({perPage: settings.paddle.api.pageSize, customerId: [idOrUser.paddleId]})
                    const tPage = await tList.next()
                    if (tPage.length > 0) {
                        result = _.sortBy(tPage, "updatedAt").pop()
                    }
                }
            }

            logger.info("Paddle.getSubscription", logDetails, result ? `${result.id} : ${result.status}` : "Not found")
            return result
        } catch (ex) {
            logger.error("Paddle.getSubscription", logDetails, ex)
            throw ex
        }
    }

    /**
     * Cancel the subscription for the specified user.
     * @param user The user data.
     */
    cancelSubscription = async (user: UserData): Promise<void> => {
        try {
            await api.client.subscriptions.cancel(user.subscriptionId, {effectiveFrom: "next_billing_period"})
            logger.info("Paddle.cancelSubscription", logHelper.user(user), `Cancelled: ${user.subscriptionId}`)
        } catch (ex) {
            if (ex.code == "subscription_update_when_canceled") {
                logger.warn("Paddle.cancelSubscription", logHelper.user(user), `Subscription ${user.subscriptionId} was already cancelled on Paddle`)

                const sub = await subscriptions.getById(user.subscriptionId)
                if (sub.status != "CANCELLED") {
                    sub.status = "CANCELLED"
                    await subscriptions.update({id: user.subscriptionId, dateUpdated: new Date(), dateNextPayment: FieldValue.delete() as any, status: "CANCELLED"})
                    eventManager.emit("Paddle.subscriptionUpdated", sub)
                }
                return
            }

            logger.error("Paddle.cancelSubscription", logHelper.user(user), ex)
            throw ex
        }
    }

    /**
     * Get a new transaction for the user to update the payment method (if needed).
     * @param user The user data.
     */
    getUpdateTransaction = async (user: UserData): Promise<Transaction> => {
        try {
            let transaction: Transaction

            // Check if existing transaction ID is still valid.
            if (user.paddleTransactionId) {
                transaction = await api.client.transactions.get(user.paddleTransactionId)
                if (transaction?.origin == "subscription_payment_method_change" && dayjs(transaction.createdAt).diff(new Date(), "hours") < 1) {
                    logger.warn("Paddle.getUpdateTransaction", logHelper.user(user), `User already has a transaction ID ${user.paddleTransactionId}, will use it instead`)
                    return transaction
                }
            }

            // Get a transaction to update the payment method.
            transaction = await api.client.subscriptions.getPaymentMethodChangeTransaction(user.subscriptionId)

            if (transaction?.id) {
                logger.info("Paddle.getUpdateTransaction", logHelper.user(user), transaction.id, transaction.status)
            } else {
                logger.warn("Paddle.getUpdateTransaction", logHelper.user(user), "Failed to get a new transaction")
            }

            return transaction
        } catch (ex) {
            logger.error("Paddle.getUpdateTransaction", logHelper.user(user), ex)
            throw ex
        }
    }
}

// Exports...
export default PaddleSubscriptions.Instance
