// Strautomator Web: Complete the OAuth2 login flow

import {strava, users} from "strautomator-core"
import {defineEventHandler, getQuery, sendRedirect} from "nuxt/server"
import {getSafeRedirectUrl, redirectToOAuth, saveSessionData} from "../../utils/oauth"
import {commitSession} from "../../utils/session"
import logger from "anyhow"
import setmeup from "setmeup"
const settings = setmeup.settings

export default defineEventHandler(async (event) => {
    const defaultRedirect = "/dashboard"
    const query = getQuery(event)
    const code = query.code as string
    let redirectUrl: string

    try {
        const state = Buffer.from((query.state as string) || "", "base64").toString("binary")
        redirectUrl = getSafeRedirectUrl(state, defaultRedirect)
    } catch (ex) {
        logger.error("OAuth.authenticateCallbackToken", "Can't parse redirect URL", ex)
        redirectUrl = defaultRedirect
    }

    try {
        const stravaTokens = await strava.getToken(code)

        if (!stravaTokens || !stravaTokens.accessToken) {
            logger.warn("OAuth.authenticateCallbackToken", code, "Can't extract access token, will restart the OAuth2 flow")
            return redirectToOAuth(event)
        }

        const {accessToken, refreshToken, expiresAt} = stravaTokens

        // Get athlete data from Strava.
        const athlete = await strava.athletes.getAthlete(stravaTokens)
        if (!athlete) {
            throw new Error("Strava athlete not found")
        }

        // Check for existing user and create a new one if necessary.
        await users.upsert(athlete, stravaTokens, true)

        // Only proceed if session data has been validated and saved successfully.
        const saved = await saveSessionData(event, {accessToken, refreshToken, expiresAt}, athlete)
        commitSession(event)

        if (saved) {
            logger.info("OAuth.authenticateCallbackToken", athlete.id, athlete.username, `Logged in, redirecting to ${redirectUrl.replace(settings.app.url, "")}`)
            return sendRedirect(event, redirectUrl, 302)
        }

        return sendRedirect(event, "/error?status=401", 302)
    } catch (ex) {
        logger.warn("OAuth.authenticateCallbackToken", ex)
        return redirectToOAuth(event)
    }
})
