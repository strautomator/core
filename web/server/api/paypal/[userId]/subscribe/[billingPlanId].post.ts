// Strautomator API: Create PayPal subscription

import {paypal, subscriptions} from "strautomator-core"
import {defineEventHandler, getRouterParam} from "nuxt/server"
import {requestValidator} from "../../../../utils/auth"
import {renderError, renderJson} from "../../../../utils/web"
import logger from "anyhow"

/**
 * Create a new PayPal subscription.
 */
export default defineEventHandler(async (event) => {
    try {
        const user = await requestValidator(event)
        const billingPlanId = getRouterParam(event, "billingPlanId", {decode: true}) as string
        const billingPlan = paypal.currentBillingPlans[billingPlanId]
        if (!billingPlan) {
            throw new Error("Invalid billing plan")
        }

        const userSubs = await subscriptions.getByUser(user)
        const paypalSubs = userSubs.filter((s) => s.source == "paypal")

        for (let sub of paypalSubs) {
            const existingSub = await paypal.subscriptions.getSubscription(sub.id)

            if (!existingSub) {
                logger.info("Routes.paypal", `Subscription not found on PayPal: ${sub.id}`)
                continue
            } else if (existingSub.billingPlan?.id == billingPlan.id && existingSub.status == "APPROVAL_PENDING") {
                logger.info("Routes.paypal", `Redirecting user ${user.id} to previous subscription ${existingSub.id}`)
                return renderJson(event, existingSub)
            } else if (existingSub.status == "ACTIVE" && existingSub.dateNextPayment) {
                logger.warn("Routes.paypal", `Already subscribed (${existingSub.id})`)
                return renderJson(event, existingSub)
            }
        }

        const subscription = await paypal.subscriptions.createSubscription(billingPlan, user.id)
        return renderJson(event, subscription)
    } catch (ex) {
        return renderError(event, ex)
    }
})
