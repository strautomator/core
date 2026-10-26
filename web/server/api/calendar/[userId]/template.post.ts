// Strautomator API: Calendar template

import {users} from "strautomator-core"
import type {UserCalendarTemplate} from "strautomator-core"
import {defineEventHandler} from "nuxt/server"
import {requestValidator} from "../../../utils/auth"
import {getBody, renderError, renderJson} from "../../../utils/web"

/**
 * Update the user calendar template.
 */
export default defineEventHandler(async (event) => {
    try {
        const user = await requestValidator(event)
        const body = await getBody(event)
        const template: UserCalendarTemplate = {
            eventSummary: body.eventSummary,
            eventDetails: body.eventDetails
        }

        await users.setCalendarTemplate(user, template)
        return renderJson(event, {ok: true})
    } catch (ex) {
        return renderError(event, ex, ex?.status || ex?.statusCode || 400)
    }
})
