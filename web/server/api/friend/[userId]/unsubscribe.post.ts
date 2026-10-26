// Strautomator API: Cancel an existing Friend subscription

import {mailer, users} from "strautomator-core"
import {defineEventHandler} from "nuxt/server"
import {requestValidator} from "../../../utils/auth"
import {getBody, renderError, renderJson} from "../../../utils/web"
import setmeup from "setmeup"
const settings = setmeup.settings

/**
 * Escape text inserted into the HTML notification body.
 */
const escapeHtml = (value: string): string => {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;")
}

/**
 * Cancel an existing Friend subscription.
 */
export default defineEventHandler(async (event) => {
    try {
        const user = await requestValidator(event)
        const body = await getBody(event)

        await users.switchToFree(user)

        // User provided a reason? Notify it.
        if (body?.reason) {
            mailer.send({
                to: settings.mailer.from,
                subject: `Strautomator friend subscription cancelled: ${user.id}`,
                body: `User ${escapeHtml(user.displayName || "")} (${escapeHtml(user.email || "no email")}) unsubscribed.<br>Reason: ${escapeHtml(body.reason.toString())}`
            })
        }

        return renderJson(event, {subscription: false})
    } catch (ex) {
        return renderError(event, ex)
    }
})
