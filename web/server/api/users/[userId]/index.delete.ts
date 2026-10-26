// Strautomator API: Delete user account

import {users} from "strautomator-core"
import {defineEventHandler} from "nuxt/server"
import {requestValidator} from "../../../utils/auth"
import {renderError, renderJson} from "../../../utils/web"

/**
 * Delete user account.
 */
export default defineEventHandler(async (event) => {
    try {
        const user = await requestValidator(event)

        await users.delete(user)
        return renderJson(event, {deleted: true})
    } catch (ex) {
        return renderError(event, ex)
    }
})
