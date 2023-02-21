// Strautomator Core: User Subscriptions

import {UserData} from "./types"
import {GitHubSubscription} from "../github/types"
import {PayPalSubscription} from "../paypal/types"
import database from "../database"
import logger = require("anyhow")
import dayjs from "../dayjs"
const settings = require("setmeup").settings

/**
 * Manage user subscriptions.
 */
export class UserSubscriptions {
    private constructor() {}
    private static _instance: UserSubscriptions
    static get Instance() {
        return this._instance || (this._instance = new this())
    }

    // GET SUBSCRIPTIONS
    // --------------------------------------------------------------------------

    /**
     * Get a subscription by its ID.
     * @param id The user's ID.
     */
    getById = async (id: string): Promise<PayPalSubscription | GitHubSubscription> => {
        try {
            return await database.get("subscriptions", id)
        } catch (ex) {
            logger.error("UserSubscriptions.getById", id, ex)
            throw ex
        }
    }

    /**
     * Get non-active subscriptions.
     */
    getNonActive = async (): Promise<PayPalSubscription[] | GitHubSubscription[]> => {
        try {
            const where = [["status", "in", ["SUSPENDED", "CANCELLED", "EXPIRED"]]]
            const subscriptions: PayPalSubscription[] = await database.search("subscriptions", where)
            logger.info("UserSubscriptions.getNonActive", `Got ${subscriptions.length} non-active subscriptions`)

            return subscriptions
        } catch (ex) {
            logger.error("UserSubscriptions.getNonActive", ex)
            throw ex
        }
    }

    /**
     * Get all dangling user subscriptions (user clicked to subscribed but never finished the process).
     */
    getDangling = async (): Promise<PayPalSubscription[] | GitHubSubscription[]> => {
        try {
            const minDate = dayjs.utc().add(settings.users.danglingDays, "days").toDate()
            const queries = [
                ["dateUpdated", "<", minDate],
                ["status", "==", "APPROVAL_PENDING"]
            ]

            const subscriptions: PayPalSubscription[] = await database.search("subscriptions", queries)
            logger.info("UserSubscriptions.getDangling", `Got ${subscriptions.length} subscriptions`)

            return subscriptions
        } catch (ex) {
            logger.error("UserSubscriptions.getDangling", ex)
            throw ex
        }
    }

    // UPDATE SUBSCRIPTIONS
    // --------------------------------------------------------------------------

    /**
     * Set the specified active subscription status to "EXPIRED".
     * @param subscription The subscription to be expired.
     */
    expire = async (subscription: PayPalSubscription | GitHubSubscription): Promise<void> => {
        try {
            if (subscription.status != "ACTIVE") {
                logger.warn("UserSubscriptions.expire", `User ${subscription.userId}`, subscription.id, "Subscription is not active, will not expire")
                return
            }

            subscription.status = "EXPIRED"
            await database.merge("subscriptions", {id: subscription.id, status: subscription.status})
            logger.info("UserSubscriptions.expire", `User ${subscription.userId}`, subscription.id, "Status set to EXPIRED")
        } catch (ex) {
            logger.error("UserSubscriptions.expire", `User ${subscription.userId}`, subscription.id, ex)
        }
    }

    /**
     * Delete the specified subscription. This method always resolves, as it's not considered critical.
     * @param subscription The subscription to be deleted.
     */
    delete = async (subscription: PayPalSubscription | GitHubSubscription): Promise<void> => {
        try {
            const user: UserData = await database.get("users", subscription.userId)

            // Maybe user was already removed?
            if (!user) {
                throw new Error("User not found")
            }

            // Remove the subscription reference from the user data.
            if (user.subscription) {
                await database.merge("users", {id: subscription.userId, subscription: null})
            } else {
                logger.warn("UserSubscriptions.delete", `User ${subscription.userId}`, subscription.id, "User has no subscription attached")
            }

            // Delete subscription details from the database.
            await database.delete("subscriptions", subscription.id)
            logger.info("UserSubscriptions.delete", `User ${subscription.userId}`, subscription.id, "Deleted subscription")
        } catch (ex) {
            logger.error("UserSubscriptions.delete", `User ${subscription.userId}`, subscription.id, ex)
        }
    }
}

// Exports...
export default UserSubscriptions.Instance
