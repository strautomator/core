// Strautomator API: Get user subscription details

import {subscriptions} from "strautomator-core"
import {defineEventHandler} from "nuxt/server"
import {requestValidator} from "../../../utils/auth"
import {renderError, renderJson} from "../../../utils/web"

/**
 * Get subscription details for the passed user.
 */
export default defineEventHandler(async (event) => {
    try {
        const user = await requestValidator(event)

        if (!user.subscriptionId) {
            return renderError(event, "User has no valid subscription", 404)
        }

        const subscription = await subscriptions.getById(user.subscriptionId)
        if (!subscription) {
            return renderError(event, "User subscription not found", 404)
        }

        return renderJson(event, subscription)
    } catch (ex) {
        return renderError(event, ex)
    }
})
