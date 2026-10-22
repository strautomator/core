// Strautomator API: Unread notifications

import {notifications} from "strautomator-core"
import {defineEventHandler} from "nuxt/server"
import {requestValidator} from "../../../utils/auth"
import {renderError, renderJson} from "../../../utils/web"

/**
 * Return unread notifications for the logged user.
 */
export default defineEventHandler(async (event) => {
    try {
        const user = await requestValidator(event)
        const result = await notifications.getByUser(user, false)
        return renderJson(event, result)
    } catch (ex) {
        return renderError(event, ex)
    }
})
