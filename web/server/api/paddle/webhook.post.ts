// Strautomator API: Paddle webhook

import {paddle} from "strautomator-core"
import {defineEventHandler} from "nuxt/server"
import {renderError, renderJson, readRawBody, toCoreRequest, WebError} from "../../utils/web"
import logger from "anyhow"

/**
 * Process Paddle webhooks.
 */
export default defineEventHandler(async (event) => {
    try {
        const rawBody = await readRawBody(event)
        event.context.requestBody = rawBody.toString()
        await paddle.processWebhook(toCoreRequest(event, rawBody) as any)
    } catch (ex) {
        logger.error("Routes.paddle", event.req.method, event.url.pathname + event.url.search, ex)
        if (ex instanceof WebError) return renderError(event, ex)
        return renderError(event, "Failed to process webhook", 500)
    }

    return renderJson(event, {ok: true})
})
