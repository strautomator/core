// Strautomator API: Garmin webhook

import {garmin} from "strautomator-core"
import {defineEventHandler, getRouterParam} from "nuxt/server"
import {getBody, renderError, renderJson, toCoreRequest} from "../../../utils/web"
import setmeup from "setmeup"
const settings = setmeup.settings

/**
 * Listen for Garmin webhooks.
 */
export default defineEventHandler(async (event) => {
    try {
        if (getRouterParam(event, "urlToken", {decode: true}) != settings.garmin.api.urlToken) {
            return renderError(event, "Not found", 404)
        }

        const body = await getBody(event)
        await garmin.webhooks.processWebhook(toCoreRequest(event, body) as any)
        return renderJson(event, {ok: true})
    } catch (ex) {
        return renderError(event, ex)
    }
})
