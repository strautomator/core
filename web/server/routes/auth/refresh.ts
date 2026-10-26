// Strautomator Web: Refresh the session token (for client side 401 handling)

import {defineEventHandler} from "nuxt/server"
import {updateSessionToken} from "../../utils/oauth"
import {commitSession} from "../../utils/session"

export default defineEventHandler(async (event) => {
    const {accessToken} = (await updateSessionToken(event)) || {}
    commitSession(event)

    if (accessToken) {
        return new Response(JSON.stringify({accessToken}), {status: 200, headers: {"Content-Type": "application/json"}})
    }

    return new Response(JSON.stringify({error: "Invalid session"}), {status: 401, headers: {"Content-Type": "application/json"}})
})
