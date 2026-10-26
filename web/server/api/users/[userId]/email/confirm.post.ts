// Strautomator API: Confirm user email address

import {users} from "strautomator-core"
import {defineEventHandler} from "nuxt/server"
import {requestValidator} from "../../../../utils/auth"
import {getBody, renderError, renderJson} from "../../../../utils/web"

/**
 * Confirm the user's email address with the passed token.
 */
export default defineEventHandler(async (event) => {
    try {
        const body = await getBody(event)
        if (!body) throw new Error("Missing confirmation token")

        const user = await requestValidator(event)
        if (!user.confirmEmail) throw new Error("User has no pending email confirmation")

        const arrConfirmEmail = user.confirmEmail.split(":")
        const token = arrConfirmEmail.shift()
        const email = arrConfirmEmail.join(":")

        if (token != body.token) throw new Error("Invalid confirmation token")
        if (email != body.email) throw new Error("Invalid confirmation email")

        await users.setEmail(user, email)
        return renderJson(event, {email: email})
    } catch (ex) {
        return renderError(event, ex, 400)
    }
})
