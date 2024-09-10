// Strautomator Core: Paddle Customers

import {EventEntity, Subscription, SubscriptionNotification, Transaction, TransactionNotification} from "@paddle/paddle-node-sdk"
import {FieldValue} from "@google-cloud/firestore"
import {PaddleSubscription} from "./types"
import {UserData} from "../users/types"
import api from "./api"
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
     * Create a matching subscription when it gets activated by Paddle.
     * @param entity Subscription notification.
     */
    onSubscriptionCreated = async (entity: EventEntity): Promise<PaddleSubscription> => {
        const data = entity.data as SubscriptionNotification

        try {
            const customData = entity.data as any
            const userId = customData?.userId || null
            const user = await users.getByPaddleId(data.customerId)
            if (!user) {
                throw new Error(`User ${data.customerId || userId} not found`)
            }

            // Required fields.
            const sub: PaddleSubscription = {
                source: "paddle",
                id: data.id,
                userId: user.id,
                customerId: data.customerId,
                status: data.status != "active" ? "APPROVAL_PENDING" : "ACTIVE",
                currency: data.currencyCode,
                dateCreated: dayjs(data.createdAt || new Date()).toDate(),
                dateUpdated: dayjs(data.updatedAt || new Date()).toDate()
            }

            if (data.billingCycle) {
                sub.frequency = data.billingCycle.interval == "month" ? "monthly" : "yearly"
            }
            if (data.items?.length > 0) {
                const item = data.items[0]
                sub.price = parseFloat(item.price.unitPrice.amount) / 100
                sub.currency = item.price.unitPrice.currencyCode
                if (!sub.frequency && !item.recurring) {
                    sub.frequency = "lifetime"
                }
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
            const user = await users.getByPaddleId(data.customerId)
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

            const status = data.status == "active" ? "ACTIVE" : data.status == "paused" || data.status == "past_due" ? "SUSPENDED" : "CANCELLED"
            if (status != sub.status) {
                updatedSub.status = status
                hasChanges = true
            }

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
            if (!sub.dateLastPayment || lastPayment?.diff(sub.dateLastPayment, "hours") > 1) {
                updatedSub.dateLastPayment = lastPayment.toDate()
                hasChanges = true
            }
            if (!sub.dateNextPayment || nextPayment?.diff(sub.dateNextPayment, "hours") > 1) {
                updatedSub.dateNextPayment = nextPayment.toDate()
                hasChanges = true
            }

            // Scheduled to be cancelled in the future? Remove the next payment date.
            if (data.scheduledChange?.action) {
                const effectiveDate = dayjs(data.scheduledChange.effectiveAt).format("ll")
                logger.info("Paddle.onSubscriptionUpdated", logHelper.paddleEvent(entity), `Scheduled change: ${data.scheduledChange.action} on ${effectiveDate}`)
                if (updatedSub.dateNextPayment) {
                    updatedSub.dateNextPayment = FieldValue.delete() as any
                    hasChanges = true
                }
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
            const user = (await users.getByPaddleId(data.customerId)) || (await users.getById(userId))
            if (!user) {
                throw new Error(`User ${data.customerId || userId} not found`)
            }

            // Make sure the subscription was previously created.
            let sub = (await subscriptions.getById(data.subscriptionId)) as PaddleSubscription
            if (!sub) {
                throw new Error(`Subscription ${data.subscriptionId} not found`)
            }

            let hasChanges = false
            const updatedSub: Partial<PaddleSubscription> = {
                id: sub.id,
                userId: sub.userId,
                dateUpdated: dayjs(data.updatedAt || sub.dateUpdated).toDate()
            }

            // Update discount and tax details.
            if (data.details?.totals) {
                const discount = parseFloat(data.details.totals.discount) / 100
                const tax = parseFloat(data.details.totals.tax) / 100
                if (discount != sub.discount) {
                    updatedSub.discount = discount > 0 ? discount : (FieldValue.delete() as any)
                    hasChanges = true
                }
                if (tax != sub.tax) {
                    updatedSub.tax = tax > 0 ? tax : (FieldValue.delete() as any)
                    hasChanges = true
                }
            }

            // Completed?
            if (data.status == "completed") {
                const lastPayment = data.billedAt ? dayjs(data.billedAt) : null
                if (!sub.dateLastPayment || (lastPayment && lastPayment.diff(sub.dateLastPayment, "hours") > 1)) {
                    updatedSub.dateLastPayment = lastPayment.toDate()
                    hasChanges = true
                }
                const nextPayment = data.billingPeriod?.endsAt ? dayjs(data.billingPeriod.endsAt) : null
                if (!sub.dateNextPayment || (nextPayment && nextPayment.diff(sub.dateNextPayment, "hours") > 1)) {
                    updatedSub.dateLastPayment = nextPayment.toDate()
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
     * @param idOrUser The subscription ID or user data.
     */
    getSubscription = async (idOrUser: string | UserData): Promise<Subscription> => {
        const logDetails = _.isString(idOrUser) ? idOrUser : logHelper.user(idOrUser)

        try {
            let result: Subscription

            if (_.isString(idOrUser)) {
                result = await api.client.subscriptions.get(idOrUser)
            } else {
                let res = api.client.subscriptions.list({perPage: settings.paddle.api.pageSize, customerId: [idOrUser.paddleId]})
                let page = await res.next()
                if (page.length > 0) {
                    result = page[0]
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
            await api.client.subscriptions.cancel(user.subscriptionId, {effectiveFrom: "immediately"})
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
