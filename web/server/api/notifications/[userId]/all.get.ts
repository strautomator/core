// Strautomator API: All notifications

import {notifications} from "strautomator-core"
import {defineEventHandler} from "nuxt/server"
import {requestValidator} from "../../../utils/auth"
import {renderError, renderJson} from "../../../utils/web"

/**
 * Return all (including expired) notifications for the logged user.
 */
export default defineEventHandler(async (event) => {
    try {
        const user = await requestValidator(event)
        const result = await notifications.getByUser(user, true)
        return renderJson(event, result)
    } catch (ex) {
        return renderError(event, ex)
    }
})
