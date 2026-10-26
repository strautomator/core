// Strautomator API: Paddle update transaction

import {paddle} from "strautomator-core"
import {defineEventHandler} from "nuxt/server"
import {requestValidator} from "../../../utils/auth"
import {renderError, renderJson} from "../../../utils/web"

/**
 * Get a new transaction ID so the user can manage / update the payment details.
 */
export default defineEventHandler(async (event) => {
    try {
        const user = await requestValidator(event)

        if (!user.subscriptionId) {
            return renderJson(event, {newCheckout: true})
        }

        const transaction = await paddle.subscriptions.getUpdateTransaction(user)
        user.paddleTransactionId = transaction.id
        return renderJson(event, transaction)
    } catch (ex) {
        return renderError(event, ex, 400)
    }
})
