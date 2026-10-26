// Strautomator API: Delete shared recipe

import {recipes} from "strautomator-core"
import {defineEventHandler, getRouterParam} from "nuxt/server"
import {requestValidator} from "../../../utils/auth"
import {renderError, renderJson} from "../../../utils/web"

/**
 * Delete an existing shared automation.
 */
export default defineEventHandler(async (event) => {
    try {
        const user = await requestValidator(event)
        const recipeId = getRouterParam(event, "id", {decode: true}) as string
        await recipes.deleteSharedRecipe(user, recipeId)

        return renderJson(event, {deleted: recipeId})
    } catch (ex) {
        return renderError(event, ex)
    }
})
