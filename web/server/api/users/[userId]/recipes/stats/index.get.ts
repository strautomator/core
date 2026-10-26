// Strautomator API: Get all user recipe stats

import {defineEventHandler} from "nuxt/server"
import {getRecipeStats} from "../../../../../utils/logic"
import {requestValidator} from "../../../../../utils/auth"
import {renderError, renderJson} from "../../../../../utils/web"

/**
 * Get all the recipe stats for the user.
 */
export default defineEventHandler(async (event) => {
    try {
        const user = await requestValidator(event)
        return renderJson(event, await getRecipeStats(user))
    } catch (ex) {
        return renderError(event, ex)
    }
})
