// Strautomator Web: Rate limiting and Cloudflare protection

import {defineEventHandler, getRequestHeader} from "nuxt/server"
import {getClientIP, renderError} from "../utils/web"
import logger from "anyhow"
import setmeup from "setmeup"
const settings = setmeup.settings

/**
 * Rate limit counters per IP.
 */
const hits: Map<string, {count: number; resetAt: number}> = new Map()
let lastCleanup = Date.now()

/**
 * Check if the passed path is protected (API, MCP and auth routes).
 * @param path The request path.
 */
const isProtectedPath = (path: string): boolean => {
    return path.startsWith("/api/") || path == "/mcp" || path.startsWith("/mcp/") || path.startsWith("/auth/")
}

/**
 * Rate limit the API, MCP and auth routes (if defined on the settings), and
 * optionally require requests to come via Cloudflare.
 */
export default defineEventHandler((event) => {
    const path = event.url.pathname
    if (!isProtectedPath(path)) {
        return
    }

    const method = event.req.method
    const fullPath = path + event.url.search
    const ip = getClientIP(event)
    const rateLimit = settings.api.rateLimit

    // Fixed window rate limiting, same defaults as express-rate-limit.
    if (rateLimit?.max) {
        const now = Date.now()
        const windowMs = rateLimit.windowMs || 60000

        // Cleanup expired counters once per window.
        if (now - lastCleanup > windowMs) {
            lastCleanup = now
            for (const [key, value] of hits) {
                if (value.resetAt <= now) hits.delete(key)
            }
        }

        let entry = hits.get(ip)
        if (!entry || entry.resetAt <= now) {
            entry = {count: 0, resetAt: now + windowMs}
            hits.set(ip, entry)
        }
        entry.count++

        const remaining = Math.max(rateLimit.max - entry.count, 0)

        // express-rate-limit sends X-RateLimit-* unless legacyHeaders is turned off.
        const legacyHeaders = rateLimit.headers ?? rateLimit.legacyHeaders ?? true
        if (legacyHeaders) {
            event.res.headers.set("X-RateLimit-Limit", rateLimit.max.toString())
            event.res.headers.set("X-RateLimit-Remaining", remaining.toString())
            event.res.headers.set("X-RateLimit-Reset", Math.ceil(entry.resetAt / 1000).toString())
            event.res.headers.set("Date", new Date().toUTCString())
        }
        if (rateLimit.standardHeaders) {
            event.res.headers.set("RateLimit-Policy", `${rateLimit.max};w=${Math.ceil(windowMs / 1000)}`)
            event.res.headers.set("RateLimit-Limit", rateLimit.max.toString())
            event.res.headers.set("RateLimit-Remaining", remaining.toString())
            event.res.headers.set("RateLimit-Reset", Math.ceil((entry.resetAt - now) / 1000).toString())
        }

        if (entry.count > rateLimit.max) {
            logger.warn("Routes", method, fullPath, `From: ${ip}`, "Rate limited")
            return new Response(rateLimit.message || "Too many requests, please try again later.", {status: rateLimit.statusCode || 429})
        }

        if (path.startsWith("/api/") && [50, 10, 5, 1].includes(remaining)) {
            logger.warn("Routes", method, fullPath, `From ${ip}`, `Rate limit remaining: ${remaining}`)
        }
    }

    // Only accept connections coming via Cloudflare? Require both CF-Ray and CF-Connecting-IP headers.
    if (settings.api.requireCloudflare) {
        if (!getRequestHeader(event, "cf-ray") || !getRequestHeader(event, "cf-connecting-ip")) {
            logger.error("WebServer.requireCloudflare", method, fullPath, "Missing CF-Ray header", ip)
            return renderError(event, "Access denied", 401)
        }
    }
})
