// Strautomator API: Mailer bounce webhook

import {events} from "strautomator-core"
import {defineEventHandler, getRouterParam} from "nuxt/server"
import crypto from "node:crypto"
import {isSnsUrl, verifySnsMessage} from "../../../utils/sns"
import {renderError, renderJson} from "../../../utils/web"
import axios from "axios"
import logger from "anyhow"
import setmeup from "setmeup"
const settings = setmeup.settings

/**
 * Handle email bounces.
 */
export default defineEventHandler(async (event) => {
    try {
        if (!settings.mailer.bounceUrlToken) {
            return renderError(event, "Bounce notifications not enabled on this server", 403)
        }
        const tokenHash = (value: string) =>
            crypto
                .createHash("sha256")
                .update(value || "")
                .digest()
        const bounceUrlToken = getRouterParam(event, "bounceUrlToken", {decode: true}) as string
        if (!crypto.timingSafeEqual(tokenHash(bounceUrlToken), tokenHash(settings.mailer.bounceUrlToken))) {
            return renderError(event, "Invalid URL bounce token", 404)
        }

        let body: any = await event.req.text()
        event.context.requestBody = body
        if (!body) {
            return renderError(event, "Missing body", 400)
        }
        if (typeof body === "string") {
            try {
                body = JSON.parse(body)
            } catch {
                return renderError(event, "Invalid body", 400)
            }
        }

        if (settings.mailer.bounceTopicArn && body.TopicArn != settings.mailer.bounceTopicArn) {
            logger.warn("Routes.mailer", event.req.method, event.url.pathname + event.url.search, `Unexpected topic: ${body.TopicArn}`)
            return renderError(event, "Invalid topic", 403)
        }
        if (!(await verifySnsMessage(body))) {
            logger.warn("Routes.mailer", event.req.method, event.url.pathname + event.url.search, "Invalid SNS signature")
            return renderError(event, "Invalid signature", 403)
        }

        if (body.Type == "SubscriptionConfirmation" && body.SubscribeURL) {
            if (!isSnsUrl(body.SubscribeURL)) {
                return renderError(event, "Invalid SubscribeURL", 400)
            }

            logger.info("Routes.mailer", event.req.method, event.url.pathname + event.url.search, "Subscription confirmed")

            await axios.get(body.SubscribeURL, {maxRedirects: 0, timeout: 10000})
            return renderJson(event, {confirmed: true})
        }

        if (body.Type == "Notification" && body.Message) {
            const message = typeof body.Message === "string" ? JSON.parse(body.Message) : body.Message
            if (message.notificationType == "Bounce" && message.bounce?.bouncedRecipients) {
                for (const recipient of message.bounce.bouncedRecipients) {
                    events.emit("Users.emailBounced", recipient.emailAddress)
                }
            }
        }

        return renderJson(event, {ok: true})
    } catch (ex) {
        return renderError(event, ex)
    }
})
