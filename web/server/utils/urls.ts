// URL validation helpers

import net from "net"

const webhookHttpMethods = ["HEAD", "GET", "POST", "PUT", "PATCH", "DELETE"]

/**
 * Parse a value as a URL and return it, or null if invalid.
 */
export const parseUrl = (value: string): URL | null => {
    if (!value || typeof value != "string") {
        return null
    }

    try {
        return new URL(value.trim())
    } catch {
        return null
    }
}

/**
 * Whether the value is an absolute URL on the same origin as settings.app.url.
 */
export const isAppOriginUrl = (value: string, appUrl: string): boolean => {
    const target = parseUrl(value)
    const app = parseUrl(appUrl)

    if (!target || !app) {
        return false
    }

    return target.origin == app.origin
}

/**
 * Extract the URL from a webhook action value ("POST https://..." or a bare URL).
 */
export const extractWebhookUrl = (actionValue: string): string => {
    const strValue = (actionValue || "").trim()
    if (!strValue) {
        return ""
    }

    const arrValue = strValue.split(" ")
    if (arrValue.length == 1) {
        return arrValue[0]
    }

    const method = arrValue[0].toUpperCase()
    if (webhookHttpMethods.includes(method)) {
        return arrValue.slice(1).join("")
    }

    return strValue
}

/**
 * Whether a hostname is a public domain name (not an IP or local/internal host).
 */
export const isExternalDomainHost = (hostname: string): boolean => {
    if (!hostname || typeof hostname != "string") {
        return false
    }

    const host = hostname.replace(/^\[|\]$/g, "").toLowerCase()
    if (!host || host.includes(":") || net.isIP(host)) {
        return false
    }

    if (host == "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".localdomain")) {
        return false
    }

    if (!host.includes(".") || host.startsWith(".") || host.endsWith(".") || host.includes("..")) {
        return false
    }

    if (!/^[a-z0-9.-]+$/.test(host)) {
        return false
    }

    return true
}

/**
 * Whether the value is an http(s) URL pointing at an external domain (not an IP).
 */
export const isExternalDomainUrl = (value: string): boolean => {
    const parsed = parseUrl(value)
    if (!parsed) {
        return false
    }

    if (parsed.protocol != "http:" && parsed.protocol != "https:") {
        return false
    }

    if (parsed.username || parsed.password) {
        return false
    }

    return isExternalDomainHost(parsed.hostname)
}

/**
 * Validate webhook actions on a recipe. Throws if any webhook URL is not an external domain.
 */
export const validateRecipeWebhookActions = (recipe: {actions?: {type?: string; value?: string}[]}): void => {
    for (let action of recipe?.actions || []) {
        if (action.type != "webhook") {
            continue
        }

        const webhookUrl = extractWebhookUrl(action.value || "")
        if (!isExternalDomainUrl(webhookUrl)) {
            throw new Error("Webhook URL must be an external domain (IP addresses are not allowed)")
        }
    }
}
