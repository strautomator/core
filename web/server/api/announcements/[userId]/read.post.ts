// Strautomator API: Mark announcement as read

import {announcements} from "strautomator-core"
import {defineEventHandler} from "nuxt/server"
import {requestValidator} from "../../../utils/auth"
import {getBody, renderJson} from "../../../utils/web"

/**
 * When user closes an announcement, increase its read count.
 */
export default defineEventHandler(async (event) => {
    try {
        const user = await requestValidator(event)
        const body = await getBody(event)

        const id = body?.id
        if (!id) throw new Error("Missing announcement ID")

        await announcements.setReadCount(user, id)
        return renderJson(event, {read: true})
    } catch (ex) {
        return renderJson(event, {read: false})
    }
})
