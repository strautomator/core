// Strautomator API: Cancel an existing PRO subscription

import {mailer, paddle, paypal, subscriptions, users} from "strautomator-core"
import type {UserData} from "strautomator-core"
import {FieldValue} from "@google-cloud/firestore"
import {defineEventHandler} from "nuxt/server"
import {requestValidator} from "../../../utils/auth"
import {getBody, renderError, renderJson} from "../../../utils/web"
import mcpStore from "../../../mcp/store"
import setmeup from "setmeup"
const settings = setmeup.settings

/**
 * Cancel an existing PRO subscription.
 */
export default defineEventHandler(async (event) => {
    try {
        const user = await requestValidator(event)
        const body = await getBody(event)

        const subscription = await subscriptions.getById(user.subscriptionId)
        if (!subscription) {
            return renderError(event, "User subscription not found", 404)
        }

        let message = "Your subscription has been cancelled."

        if (subscription.source == "paddle") {
            await paddle.subscriptions.cancelSubscription(user)
            message = "Your subscription is scheduled to be cancelled on Paddle, and you will not be charged in the future."
        } else if (subscription.source == "paypal") {
            const paypalSubscription = await paypal.subscriptions.getSubscription(user.subscriptionId)
            if (!paypalSubscription) {
                return renderError(event, `Subscription ${user.subscriptionId} is invalid`, 404)
            }

            paypalSubscription.userId = user.id
            await paypal.subscriptions.cancelSubscription(paypalSubscription)
            message = "Your subscription was cancelled on PayPal, and you will not be charged in the future."
        } else {
            const data: Partial<UserData> = {
                id: user.id,
                displayName: user.displayName,
                isPro: false,
                subscriptionId: FieldValue.delete() as any
            }
            await users.update(data)
            await mcpStore.revokeUser(user.id)

            if (subscription.source == "github") {
                message = "Your subscription is managed via GitHub. Please go to https://github.com/sponsors/accounts to manually cancel your sponsorship."
            } else {
                message = `Your subscription is tied to an affiliate campaign. If you wish to re-enable it in the future, please contact us at ${settings.mailer.contact}`
            }
        }

        if (body?.reason) {
            await mailer.send({
                to: settings.mailer.contact,
                subject: `Subscription cancelled: ${user.id}`,
                body: `User ${user.displayName} (${user.email || "no email"}) cancelled subscription ${subscription.id}.<br>Reason: ${body.reason}`
            })
        }

        return renderJson(event, {message: message})
    } catch (ex) {
        return renderError(event, ex)
    }
})
