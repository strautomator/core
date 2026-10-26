// Strautomator API: PayPal webhook GET

import {paypal} from "strautomator-core"
import {defineEventHandler, getRouterParam} from "nuxt/server"
import {getBody, renderError, renderJson} from "../../../utils/web"
import setmeup from "setmeup"
const settings = setmeup.settings

/**
 * Process webhooks dispatched by PayPal.
 */
export default defineEventHandler(async (event) => {
    try {
        if (getRouterParam(event, "urlToken", {decode: true}) != settings.paypal.api.urlToken) {
            return renderError(event, "Invalid URL token", 401)
        }

        const data = await getBody(event, {allowGet: true})
        if (!data) {
            return renderError(event, "Missing request body", 400)
        }

        await paypal.webhooks.processWebhook(data)
        return renderJson(event, {ok: true})
    } catch (ex) {
        return renderError(event, ex)
    }
})
