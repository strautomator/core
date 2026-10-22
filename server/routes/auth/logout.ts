// Strautomator Web: Logout

import {defineEventHandler, sendRedirect} from "nuxt/server"
import {logoutSession} from "../../utils/oauth"
import {commitSession} from "../../utils/session"

export default defineEventHandler((event) => {
    logoutSession(event)
    commitSession(event)
    return sendRedirect(event, "/home", 302)
})
