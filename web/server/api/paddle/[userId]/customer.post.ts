// Strautomator API: Paddle customer

import {paddle, users} from "strautomator-core"
import type {UserData} from "strautomator-core"
import {defineEventHandler} from "nuxt/server"
import {requestValidator} from "../../../utils/auth"
import {getBody, renderError, renderJson} from "../../../utils/web"
import logger from "anyhow"

/**
 * Update user with Paddle customer details and set the user ID on Paddle.
 */
export default defineEventHandler(async (event) => {
    try {
        const user = await requestValidator(event, {acceptPreviousToken: true})
        const data = await getBody(event)
        if (!data || !data.id) {
            throw new Error("Missing Paddle ID")
        }

        if (event.url.searchParams.get("migration") == "1") {
            logger.info("Routes.paddle", `User ${user.id} started migration of PayPal ${user.subscriptionId} to Paddle`)
        }

        user.paddleId = data.id
        user.paddleTransactionId = data.transactionId
        const updatedUser: Partial<UserData> = {id: user.id, displayName: user.displayName, paddleId: user.paddleId, paddleTransactionId: user.paddleTransactionId}
        await users.update(updatedUser)
        await paddle.customers.setCustomerUser(user)

        return renderJson(event, {ok: true})
    } catch (ex) {
        return renderError(event, ex, 400)
    }
})
