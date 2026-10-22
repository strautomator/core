// Strautomator MCP helpers

import crypto from "crypto"
import _ from "lodash"
import {getRequestHeader, type RequestEvent} from "nuxt/server"
import type {StravaProcessedActivity, UserData} from "strautomator-core"
import {renderJson} from "../utils/web"
import setmeup from "setmeup"
const settings = setmeup.settings

// CONFIG
// --------------------------------------------------------------------------

/**
 * MCP runtime config derived from SetMeUp settings.
 */
export const getMcpConfig = () => {
    const mcp = settings.mcp || {}
    const oauth = settings.oauth || {}
    const appUrl = (settings.app.url || "").replace(/\/+$/, "")

    return {
        appUrl,
        issuer: appUrl,
        resource: `${appUrl}/mcp`,
        mcpPath: mcp.path || "/mcp",
        scope: mcp.scope || "mcp",
        accessTokenHours: mcp.accessTokenHours || 1,
        refreshTokenDays: mcp.refreshTokenDays || 30,
        authCodeMinutes: mcp.authCodeMinutes || 10,
        authRequestMinutes: mcp.authRequestMinutes || 15,
        clientDays: mcp.clientDays || 365,
        unusedClientHours: mcp.unusedClientHours || 24,
        maxRedirectUris: mcp.maxRedirectUris || 5,
        registerPerHour: mcp.registerPerHour || 20,
        cookieName: settings.cookie.sessionName,
        cookieSecret: settings.cookie.secret,
        assumeUser: process.env.NODE_ENV == "production" ? undefined : oauth.assumeUser,
        protocolVersions: ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"]
    }
}

// TOKENS AND PKCE
// --------------------------------------------------------------------------

/**
 * Encode a buffer as base64url (no padding).
 */
export const toBase64Url = (value: Buffer | string): string => {
    const buf = Buffer.isBuffer(value) ? value : Buffer.from(value)
    return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
}

/**
 * Decode a base64url string.
 */
export const fromBase64Url = (value: string): Buffer => {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4)
    return Buffer.from(padded, "base64")
}

/**
 * Cryptographically random URL-safe token.
 */
export const randomToken = (bytes: number = 32): string => {
    return toBase64Url(crypto.randomBytes(bytes))
}

/**
 * SHA-256 hex digest of a string.
 */
export const hashToken = (value: string): string => {
    return crypto.createHash("sha256").update(value).digest("hex")
}

/**
 * S256 PKCE challenge for the given verifier.
 */
export const createPkceChallenge = (verifier: string): string => {
    return toBase64Url(crypto.createHash("sha256").update(verifier).digest())
}

/**
 * Constant-time PKCE S256 verification.
 */
export const verifyPkce = (verifier: string, challenge: string): boolean => {
    if (!verifier || !challenge) {
        return false
    }
    if (verifier.length < 43 || verifier.length > 128) {
        return false
    }

    const expected = createPkceChallenge(verifier)
    const a = Buffer.from(expected)
    const b = Buffer.from(challenge)
    if (a.length != b.length) {
        return false
    }

    return crypto.timingSafeEqual(a, b)
}

// OAUTH VALIDATION
// --------------------------------------------------------------------------

/**
 * Whether a redirect URI is acceptable for dynamic client registration.
 */
export const isValidRedirectUri = (value: string): boolean => {
    if (!value || typeof value != "string" || value.length > 2048) {
        return false
    }
    if (/[\s\\]/.test(value) || value.includes(":///")) {
        return false
    }

    let parsed: URL
    try {
        parsed = new URL(value)
    } catch {
        return false
    }

    if (parsed.username || parsed.password || parsed.hash) {
        return false
    }

    const protocol = parsed.protocol.toLowerCase()
    const host = parsed.hostname.toLowerCase()

    if (protocol == "https:") {
        return host.length > 0 && host != "localhost"
    }

    if (protocol == "http:") {
        return host == "localhost" || host == "127.0.0.1" || host == "[::1]" || host == "::1"
    }

    // Custom schemes are used by desktop MCP clients (cursor://, vscode://, etc).
    const blockedSchemes = ["javascript:", "data:", "file:", "vbscript:", "blob:", "about:", "ws:", "wss:", "ftp:"]
    if (/^[a-z][a-z0-9+.-]*:$/.test(protocol) && !blockedSchemes.includes(protocol)) {
        return host.length > 0 || parsed.pathname.length > 0
    }

    return false
}

// REQUEST / RESPONSE HELPERS
// --------------------------------------------------------------------------

/**
 * Escape text for safe use in HTML.
 */
export const escapeHtml = (value: string): string => {
    return (value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;")
}

/**
 * First string value from an h3 query or body field.
 */
export const firstString = (value: any): string => {
    if (Array.isArray(value)) {
        value = value[0]
    }
    if (value === undefined || value === null) {
        return ""
    }
    return String(value)
}

/**
 * Strip secrets and credentials from a user object before returning it to an MCP client.
 */
export const sanitizeUser = (user: UserData): any => {
    const result = _.cloneDeep(user) as any

    delete result.stravaTokens
    delete result.urlToken
    delete result.garminAuthState
    delete result.wahooAuthState
    delete result.spotifyAuthState
    delete result.paddleId
    delete result.paddleTransactionId
    delete result.recipes
    delete result.fitDeviceNames

    if (result.confirmEmail) {
        result.confirmEmail = result.confirmEmail.substring(result.confirmEmail.indexOf(":") + 1)
    }
    if (result.garmin) {
        delete result.garmin.tokens
    }
    if (result.wahoo) {
        delete result.wahoo.tokens
    }
    if (result.spotify) {
        delete result.spotify.tokens
    }

    return result
}

/**
 * Activity id and the automations that ran. Strava activity metadata is omitted.
 */
export const toMcpProcessedActivity = (activity: StravaProcessedActivity | null | undefined) => {
    if (!activity) return null

    const recipes: NonNullable<StravaProcessedActivity["recipes"]> = {}
    for (const [id, recipe] of Object.entries(activity.recipes || {})) {
        recipes[id] = {title: recipe.title, conditions: recipe.conditions, actions: recipe.actions}
    }

    return {id: activity.id, recipes}
}

// MCP TOOL PAYLOADS
// --------------------------------------------------------------------------

/**
 * JSON-serialize a value, converting dates to ISO strings.
 */
export const toJsonText = (data: any): string => {
    return JSON.stringify(
        data,
        (_key, value) => {
            if (value instanceof Date) {
                return value.toISOString()
            }
            return value
        },
        2
    )
}

/**
 * MCP tool success payload.
 */
export const toolResult = (data: any) => {
    return {content: [{type: "text" as const, text: typeof data == "string" ? data : toJsonText(data)}]}
}

/**
 * MCP tool error payload.
 */
export const toolError = (message: string) => {
    return {content: [{type: "text" as const, text: message}], isError: true}
}

// HTTP HEADERS
// --------------------------------------------------------------------------

/**
 * Apply headers to a Response and return it for chaining.
 */
export const withHeaders = (response: Response, headers: Record<string, string | number>): Response => {
    for (const [name, value] of Object.entries(headers)) {
        response.headers.set(name, value.toString())
    }
    return response
}

/**
 * Apply CORS headers required by browser-based MCP clients.
 */
export const setCorsHeaders = (event: RequestEvent, response?: Response): void => {
    const origin = getRequestHeader(event, "origin")
    const headers = response?.headers || event.res.headers
    headers.set("Access-Control-Allow-Origin", origin || "*")
    headers.set("Vary", "Origin")
    headers.set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
    headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type, MCP-Protocol-Version, MCP-Session-Id")
    headers.set("Access-Control-Expose-Headers", "WWW-Authenticate, MCP-Protocol-Version, MCP-Session-Id")
}

/**
 * Return a JSON response with MCP CORS headers.
 */
export const jsonResponse = (event: RequestEvent, data: any, status?: number): Response => {
    const response = renderJson(event, data, status)
    setCorsHeaders(event, response)
    return response
}

/**
 * Return an HTML response, optionally adding MCP CORS headers.
 */
export const htmlResponse = (event: RequestEvent, html: string, status?: number, cors: boolean = true): Response => {
    const response = new Response(html, {status: status || 200, headers: {"Content-Type": "text/html; charset=utf-8"}})
    if (cors) {
        setCorsHeaders(event, response)
    }
    return response
}

/**
 * Return an empty response, optionally adding MCP CORS headers.
 */
export const emptyResponse = (event: RequestEvent, status: number = 200, cors: boolean = true): Response => {
    const response = new Response(null, {status})
    if (cors) {
        setCorsHeaders(event, response)
    }
    return response
}

/**
 * RFC 9728 WWW-Authenticate challenge for the MCP resource.
 */
export const setWwwAuthenticate = (event: RequestEvent, response?: Response, extra?: string): void => {
    const config = getMcpConfig()
    const parts = [`Bearer realm="Strautomator"`, `resource_metadata="${config.issuer}/.well-known/oauth-protected-resource"`, `scope="${config.scope}"`]
    if (extra) {
        parts.push(extra)
    }
    const headers = response?.headers || event.res.headers
    headers.set("WWW-Authenticate", parts.join(", "))
}
