// Strautomator API: Wahoo webhook

import {wahoo} from "strautomator-core"
import {defineEventHandler, getRouterParam} from "nuxt/server"
import {getBody, renderError, renderJson, toCoreRequest} from "../../../utils/web"
import setmeup from "setmeup"
const settings = setmeup.settings

/**
 * Listen for Wahoo webhooks.
 */
export default defineEventHandler(async (event) => {
    try {
        if (getRouterParam(event, "urlToken", {decode: true}) != settings.wahoo.api.urlToken) {
            return renderError(event, "Not found", 404)
        }

        const body = await getBody(event)
        await wahoo.webhooks.processWebhook(toCoreRequest(event, body) as any)
        return renderJson(event, {ok: true})
    } catch (ex) {
        return renderError(event, ex)
    }
})
