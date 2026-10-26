// Strautomator API: Active announcements

import {announcements} from "strautomator-core"
import {defineEventHandler, getRequestHeader} from "nuxt/server"
import {requestValidator} from "../../../utils/auth"
import {renderError, renderJson} from "../../../utils/web"

/**
 * Return active announcements. The read count will always come zeroed to clients.
 */
export default defineEventHandler(async (event) => {
    try {
        const user = await requestValidator(event)

        if (!user.countryCode) {
            user.countryCode = getRequestHeader(event, "cf-ipcountry")
        }

        const result = await announcements.getActive(user)
        result.forEach((a) => delete a.readCount)

        return renderJson(event, result)
    } catch (ex) {
        return renderError(event, ex)
    }
})
