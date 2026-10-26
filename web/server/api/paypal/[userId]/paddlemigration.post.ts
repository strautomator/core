// Strautomator API: PayPal to Paddle migration

import {paypal, subscriptions, users} from "strautomator-core"
import {defineEventHandler} from "nuxt/server"
import {requestValidator} from "../../../utils/auth"
import {getBody, renderError, renderJson} from "../../../utils/web"

/**
 * Triggered when a user has migrated from PayPal to Paddle.
 */
export default defineEventHandler(async (event) => {
    try {
        const user = await requestValidator(event)
        const body = await getBody(event)

        if (!user.paddleId) {
            throw new Error("User has not subscribed to Paddle yet")
        }
        if (!body.paddleTransactionId) {
            throw new Error("Missing Paddle transaction ID")
        }

        const userSubs = await subscriptions.getByUser(user)
        const paypalSub = userSubs.find((s) => s.source == "paypal" && s.status == "ACTIVE")
        if (!paypalSub) {
            throw new Error("User has no active PayPal subscription")
        }

        if (user.subscriptionId == paypalSub.id) {
            user.subscriptionId = body.paddleTransactionId
            await users.update({id: user.id, displayName: user.displayName, subscriptionId: user.subscriptionId})
        }

        let refundAmount = null
        if (body.lifetime) {
            await paypal.subscriptions.cancelSubscription(paypalSub as any, `Migrated to Paddle lifetime: (${body.paddleTransactionId})`)
        } else {
            refundAmount = await paypal.subscriptions.refundAndCancel(user, paypalSub.id, `Migrated to Paddle yearly: (${body.paddleTransactionId})`)
        }

        return renderJson(event, {subscriptionId: paypalSub.id, refundAmount: refundAmount})
    } catch (ex) {
        return renderError(event, ex, 400)
    }
})
