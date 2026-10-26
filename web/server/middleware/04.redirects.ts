// Strautomator Web: Root route and redirections

import {defineEventHandler, getRequestHeader, getRequestHost, sendRedirect} from "nuxt/server"
import setmeup from "setmeup"
const settings = setmeup.settings

/**
 * Root route redirects to /home or /dashboard, and follow redirections defined on the settings.
 */
export default defineEventHandler((event) => {
    const path = event.url.pathname
    const url = path + event.url.search

    if (url == "/") {
        // Force remove the www.
        if (getRequestHost(event).toLowerCase().substring(0, 4) == "www.") {
            return sendRedirect(event, settings.app.url, 301)
        }

        // Logged users go to dashboard, others to home.
        const cookie = getRequestHeader(event, "cookie")
        return sendRedirect(event, cookie?.includes(`${settings.cookie.sessionName}=`) ? "/dashboard" : "/home", 302)
    }

    const redirect = settings.app.redirects?.find((r) => r.from === url)
    if (redirect) {
        return sendRedirect(event, redirect.to, 301)
    }
})
