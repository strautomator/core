// Strautomator API: Get single user recipe stats

import {defineEventHandler, getRouterParam} from "nuxt/server"
import {getRecipeStats} from "../../../../../utils/logic"
import {requestValidator} from "../../../../../utils/auth"
import {renderError, renderJson} from "../../../../../utils/web"

/**
 * Get a single recipe stats for the user.
 */
export default defineEventHandler(async (event) => {
    try {
        const recipeId = getRouterParam(event, "recipeId", {decode: true})
        const user = await requestValidator(event)

        return renderJson(event, await getRecipeStats(user, recipeId))
    } catch (ex) {
        return renderError(event, ex)
    }
})
