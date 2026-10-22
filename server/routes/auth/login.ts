// Strautomator Web: Start the OAuth2 login flow

import {defineEventHandler, getQuery, sendRedirect} from "nuxt/server"
import {assumeUser, getSafeRedirectUrl, redirectToOAuth} from "../../utils/oauth"
import {commitSession} from "../../utils/session"

export default defineEventHandler(async (event) => {
    const query = getQuery(event)
    const redirectUrl = (query["redirect-url"] as string) || "/"

    if (await assumeUser(event)) {
        commitSession(event)
        return sendRedirect(event, getSafeRedirectUrl(redirectUrl), 302)
    }

    return redirectToOAuth(event, redirectUrl)
})
