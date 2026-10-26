// Strautomator API: Get user by ID

import {defineEventHandler, getQuery} from "nuxt/server"
import {getPublicUser} from "../../../utils/logic"
import {requestValidator} from "../../../utils/auth"
import {renderError, renderJson} from "../../../utils/web"

/**
 * Get user by ID.
 */
export default defineEventHandler(async (event) => {
    try {
        const user = await requestValidator(event)
        const query = getQuery(event)

        const result = await getPublicUser(user, !!query?.refresh)
        return renderJson(event, result)
    } catch (ex) {
        return renderError(event, ex)
    }
})
