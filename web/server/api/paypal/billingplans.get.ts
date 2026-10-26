// Strautomator API: PayPal billing plans

import {paypal} from "strautomator-core"
import {defineEventHandler} from "nuxt/server"
import {renderError, renderJson} from "../../utils/web"

/**
 * Get available billing plans.
 */
export default defineEventHandler((event) => {
    try {
        return renderJson(event, paypal.currentBillingPlans)
    } catch (ex) {
        return renderError(event, ex)
    }
})
