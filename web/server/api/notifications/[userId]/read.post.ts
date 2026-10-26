// Strautomator API: Mark notifications as read

import {notifications} from "strautomator-core"
import {defineEventHandler} from "nuxt/server"
import {requestValidator} from "../../../utils/auth"
import {getBody, renderError, renderJson, WebError} from "../../../utils/web"
import _ from "lodash"
import logger from "anyhow"

/**
 * When user opens a notifications, mark it as read.
 */
export default defineEventHandler(async (event) => {
    const result = []

    try {
        const user = await requestValidator(event)
        const notificationIds = await getBody(event)
        if (!_.isArray(notificationIds)) throw new Error("Invalid notifications body")

        for (let id of notificationIds) {
            const read = await notifications.markAsRead(user, id)
            if (read) result.push(id)
        }
    } catch (ex) {
        if (ex instanceof WebError) {
            return renderError(event, ex)
        }
        logger.error("Routes.notifications", event.req.method, event.url.pathname + event.url.search, ex)
    }

    return renderJson(event, {read: result})
})
