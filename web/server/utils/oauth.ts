// Strautomator Web: OAuth2 (Strava) session handling

import {strava, users} from "strautomator-core"
import type {StravaProfile} from "strautomator-core"
import {getRequestHeader, sendRedirect, type RequestEvent} from "nuxt/server"
import {commitSession, loadSession, resetSession} from "./session"
import logger from "anyhow"
import setmeup from "setmeup"
const settings = setmeup.settings

/**
 * Strava tokens saved to the session.
 */
interface SessionTokens {
    accessToken?: string
    refreshToken?: string
    expiresAt?: number
}

/**
 * Make sure the redirect URL is safe and points to the app itself.
 * @param redirectUrl The desired redirect URL.
 * @param defaultRedirect Default URL in case the passed one is not valid.
 */
export const getSafeRedirectUrl = (redirectUrl: any, defaultRedirect: string = "/dashboard"): string => {
    if (!redirectUrl || typeof redirectUrl !== "string") {
        return defaultRedirect
    }

    const value = redirectUrl.trim()
    let path: string

    // Relative paths must stay on this site (no protocol-relative or backslash tricks).
    if (value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\")) {
        if (value.includes("\\") || value.includes("://") || /[\r\n\t]/.test(value)) {
            return defaultRedirect
        }
        path = value
    } else {
        try {
            const target = new URL(value)
            const app = new URL(settings.app.url)
            if (target.origin !== app.origin) {
                return defaultRedirect
            }
            path = `${target.pathname}${target.search}${target.hash}` || "/"
        } catch (ex) {
            return defaultRedirect
        }
    }

    // Reject protocol-relative results from same-origin absolute URLs
    // (e.g. https://app.example//evil.com → pathname "//evil.com").
    if (!path.startsWith("/") || path.startsWith("//") || path.startsWith("/\\") || path.includes("\\") || /[\r\n\t]/.test(path)) {
        return defaultRedirect
    }

    // Make sure we never redirect back to home or error pages.
    const redirectPath = path.replace("/", "").substring(0, 4)
    if (redirectPath == "home" || redirectPath == "erro" || redirectPath == "auth") {
        return defaultRedirect
    }

    return path
}

/**
 * Save the Strava tokens to the session, and identify the user. Returns true if the user was identified.
 * @param event The request event.
 * @param stravaTokens The Strava tokens.
 * @param athlete Optional Strava athlete.
 */
export const saveSessionData = async (event: RequestEvent, stravaTokens: SessionTokens, athlete?: StravaProfile): Promise<boolean> => {
    const epoch = new Date().getTime() / 1000 - 1
    const session = loadSession(event)
    let userId: string

    try {
        if (!stravaTokens || !stravaTokens.accessToken) {
            userId = session.content.userId || null
            logger.warn("OAuth.saveData", `User ${userId}`, "No access token passed to save, will reset")
            resetSession(session)
            return false
        }

        const {accessToken, refreshToken, expiresAt} = stravaTokens
        setOAuthContext(event, {accessToken})

        if (!session.content.token) {
            session.content.token = {}
        }

        session.content.token.accessToken = accessToken
        if (refreshToken) session.content.token.refreshToken = refreshToken
        if (expiresAt) session.content.token.expiresAt = expiresAt

        // Get user data from session if not expired yet.
        if (expiresAt && epoch < expiresAt) {
            userId = session.content.userId || null
        }

        // If user expired or not set yet, get from database.
        if (!userId) {
            try {
                userId = athlete?.id || null
                const userFromToken = await users.getByToken({accessToken: accessToken, refreshToken: refreshToken}, userId)

                if (userFromToken) {
                    userId = userFromToken.id
                } else {
                    logger.warn("OAuth.saveData", `Can't find ${userId ? userId : "user"} by token`)
                }
            } catch (innerEx) {
                logger.error("OAuth.saveData", "Error fetching user", innerEx)
            }
        }

        if (userId) {
            session.content.userId = userId
            setOAuthContext(event, {userId})
            return true
        }
    } catch (ex) {
        logger.error("OAuth.saveData", `User ${userId || "unknown"}`, ex)
    }

    return false
}

/**
 * Refresh the session token with Strava, if expired.
 * @param event The request event.
 */
export const updateSessionToken = async (event: RequestEvent): Promise<SessionTokens> => {
    const session = loadSession(event)
    const userId = session.content.userId || null

    let stravaTokens: SessionTokens = session.content.token || null
    if (!stravaTokens || !stravaTokens.accessToken) {
        logger.debug("OAuth.updateToken", `User ${userId || "unknown"}`, "Session token not found")
        return null
    }

    try {
        const epoch = new Date().getTime() / 1000 - 1

        // Current token expired? Refresh it.
        if (stravaTokens.expiresAt && stravaTokens.expiresAt <= epoch) {
            logger.debug("OAuth.updateToken", `User ${userId}`, `Current token expires at ${stravaTokens.expiresAt}`)
            const refreshed = await strava.refreshToken(stravaTokens.refreshToken, stravaTokens.accessToken, false)

            if (refreshed) {
                const {accessToken, refreshToken, expiresAt} = refreshed
                stravaTokens = {accessToken, refreshToken, expiresAt}
                logger.info("OAuth.updateToken", `Refreshed token for user ${userId}`, `${accessToken.substring(0, 2)}*${accessToken.substring(accessToken.length - 2)}`)
            } else {
                stravaTokens = null
            }
        } else {
            const accessToken = stravaTokens.accessToken
            logger.debug("OAuth.updateToken", `User ${userId}`, `Token still valid: ${accessToken.substring(0, 2)}*${accessToken.substring(accessToken.length - 2)}`)
        }

        await saveSessionData(event, stravaTokens)
        return stravaTokens
    } catch (ex) {
        logger.error("OAuth.updateToken", `User ${userId}`, ex)
        return null
    }
}

/**
 * Check if the request has a bearer token, and if so, save it to the session.
 * Logs out if the token is not valid.
 * @param event The request event.
 */
export const checkRequestAuthorization = async (event: RequestEvent): Promise<void> => {
    const authorization = getRequestHeader(event, "authorization")
    const existingToken = authorization ? authorization.split(" ")[1] : null

    try {
        if (existingToken) {
            await saveSessionData(event, {accessToken: existingToken})
        }
    } catch (ex) {
        logger.warn("OAuth.checkRequestAuthorization", ex)
        logoutSession(event)
    }
}

/**
 * Assume a specific user (development only, if oauth.assumeUser is set). Returns true if assumed.
 * @param event The request event.
 */
export const assumeUser = async (event: RequestEvent): Promise<boolean> => {
    if (process.env.NODE_ENV == "production" || !settings.oauth?.assumeUser) {
        return false
    }

    const session = loadSession(event)
    if (session.content.userId) {
        return false
    }

    const user = await users.getById(settings.oauth.assumeUser)
    if (!user) {
        logger.warn("OAuth.assumeUser", `User ${settings.oauth.assumeUser} not found`)
        return false
    }

    session.content.userId = user.id
    setOAuthContext(event, {userId: user.id})
    return true
}

/**
 * Clear the session.
 * @param event The request event.
 */
export const logoutSession = (event: RequestEvent): void => {
    const session = loadSession(event)
    if (session.content.userId) {
        logger.warn("OAuth.logout", session.content.userId)
    }

    resetSession(session, 0)
    event.context.oauth = {}
}

/**
 * Redirect to the Strava OAuth2 login page.
 * @param event The request event.
 * @param redirectUrl Optional URL to redirect after login.
 */
export const redirectToOAuth = (event: RequestEvent, redirectUrl?: string): string => {
    const state = redirectUrl ? Buffer.from(getSafeRedirectUrl(redirectUrl), "binary").toString("base64") : undefined
    commitSession(event)
    return sendRedirect(event, strava.getAuthUrl(state), 302)
}

/**
 * Set the OAuth details that will be passed to the Nuxt app.
 * @param event The request event.
 * @param data The OAuth data.
 */
const setOAuthContext = (event: RequestEvent, data: {userId?: string; accessToken?: string}): void => {
    event.context.oauth = Object.assign(event.context.oauth || {}, data)
}
