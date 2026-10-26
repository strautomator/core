// Strautomator API: Shared recipe

import {recipes, users} from "strautomator-core"
import {defineEventHandler, getRouterParam} from "nuxt/server"
import {requestValidator} from "../../../utils/auth"
import {renderError, renderJson} from "../../../utils/web"

/**
 * Get a shared recipe by ID.
 */
export default defineEventHandler(async (event) => {
    try {
        const user = await requestValidator(event)
        const recipeId = getRouterParam(event, "id", {decode: true}) as string
        const result = await recipes.getSharedRecipe(user, recipeId)
        const owner = await users.getById(result.userId)
        result.userDisplayName = owner.displayName || owner.id
        return renderJson(event, result)
    } catch (ex) {
        return renderError(event, ex)
    }
})
