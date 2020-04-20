// Strautomator Core: Strava Webhooks

import {StravaWebhook} from "./types"
import {UserData} from "../users/types"
import api from "./api"
import users from "../users"
import logger = require("anyhow")
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

    // GET WEBHOOKS
    // --------------------------------------------------------------------------

    /**
     * Check a subscription status based on its ID.
     */
    getSubscriptions = async (): Promise<StravaWebhook[]> => {
        try {
            const query = {
                client_id: settings.strava.api.clientId,
                client_secret: settings.strava.api.clientSecret
            }

            const data = await api.get(null, `push_subscriptions`, query)
            logger.info("Strava.getSubscriptions", `${data.length} subscriptions registered`)

            return data
        } catch (ex) {
            logger.error("Strava.getSubscriptions", ex)
            throw ex
        }
    }

    // SET WEBHOOKS
    // --------------------------------------------------------------------------

    /**
     * Subscribe to activities updates sent by Strava, and return the subscription ID.
     * @param user The relevant user to receive activities from.
     */
    setSubscription = async (user: UserData): Promise<number> => {
        try {
            const query = {
                callback_url: `${settings.app.url}strava/${settings.strava.api.urlToken}/${user.id}`,
                client_id: settings.strava.api.clientId,
                client_secret: settings.strava.api.clientSecret,
                verify_token: settings.strava.api.verifyToken
            }

            const result = await api.post(null, "push_subscriptions", query)

            if (!result.id) {
                throw new Error("Missing subscription ID from Strava")
            }

            // Save substription to user on the database.
            user.stravaSubscription = result.id
            await users.update({id: user.id, stravaSubscription: result.id} as UserData, true)

            logger.info("Strava.setSubscription", user.id, user.displayName, `Subscription ${result.id}`)

            return result.id
        } catch (ex) {
            if (ex.response && ex.response.data && ex.response.data.errors) {
                logger.error("Strava.setSubscription", user.id, ex, ex.response.data.errors[0])
            } else {
                logger.error("Strava.setSubscription", user.id, ex)
            }

            throw ex
        }
    }

    /**
     * Cancel a subscription (mostly called when user cancel the account).
     * @param user The user which should have the subscription cancelled.
     */
    cancelSubscription = async (user: UserData): Promise<void> => {
        try {
            if (!user.stravaSubscription) {
                logger.warn("Strava.cancelSubscription", `User ${user.id}, ${user.displayName} has no active webhook subscription`)
                return
            }

            const query = {
                client_id: settings.strava.api.clientId,
                client_secret: settings.strava.api.clientSecret
            }

            await api.delete(null, `push_subscriptions/${user.stravaSubscription}`, query)
            logger.info("Strava.cancelSubscription", `User ${user.id}, ${user.displayName}`, `Subscription ${user.stravaSubscription} cancelled`)
        } catch (ex) {
            logger.error("Strava.cancelSubscription", `User ${user.id}, ${user.displayName}`, ex)
            throw ex
        }
    }

    /**
     * Periodically check user subscriptions and renew them, if needed.
     */
    checkSubscriptions = async (): Promise<void> => {
        try {
            const subscriptions = await this.getSubscriptions()
            const idleUsers = await users.getIdle()

            logger.info("Strava.checkSubscriptions", `${subscriptions.length} webhooks`, `${idleUsers.length} idle users`)

            // Iterate users and make sure subscriptions are active.
            for (let user of idleUsers) {
                try {
                    let sub: StravaWebhook

                    // Find correct subscription for the user.
                    for (let s of subscriptions) {
                        if (s.id == user.stravaSubscription) {
                            sub = s
                            break
                        } else if (s.callbackUrl.indexOf(`${settings.strava.api.urlToken}/${user.id}`) > 0) {
                            logger.warn("Strava.checkSubscriptions", `User ${user.id} - ${user.displayName}`, `Wrong subscription ID ${user.stravaSubscription}, correct is ${s.id}`)
                            sub = s
                            break
                        }
                    }

                    // Reset subscription if it's not valid.
                    if (!sub) {
                        logger.info("Strava.checkSubscriptions", `User ${user.id} - ${user.displayName}`, `Subscription ${user.stravaSubscription || "empty"}`, `Needs renewal`)
                        await this.setSubscription(user)
                    } else {
                        logger.debug("Strava.checkSubscriptions", `User ${user.id} - ${user.displayName}`, `Subscription ${user.stravaSubscription} is active`)
                    }
                } catch (ex) {
                    logger.debug("Strava.checkSubscriptions", `User ${user.id} - ${user.displayName}`, user.stravaSubscription, "Failed", ex)
                }
            }
        } catch (ex) {
            logger.error("Strava.checkSubscriptions", ex)
            throw ex
        }
    }
}

// Exports...
export default StravaWebhooks.Instance
