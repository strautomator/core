// Strautomator Web: Security headers and request logging

import {defineEventHandler} from "nuxt/server"
import type {H3Event} from "nitro/h3"
import logger from "anyhow"
import setmeup from "setmeup"
const settings = setmeup.settings

const securityHeaders = {
    "X-Frame-Options": "SAMEORIGIN",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin"
}

/**
 * Basic security headers, also set on error responses.
 */
export default defineEventHandler((event) => {
    const h3Event = event as unknown as H3Event

    for (const [key, value] of Object.entries(securityHeaders)) {
        h3Event.res.headers.set(key, value)
        h3Event.res.errHeaders.set(key, value)
    }

    if (settings.app.debug) {
        logger.debug("WebServer", event.req.method, event.url.pathname + event.url.search)
    }
})
