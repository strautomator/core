// Strautomator API: Delete a user recipe

import {users} from "strautomator-core"
import {defineEventHandler, getRouterParam} from "nuxt/server"
import {upsertUserRecipe} from "../../../../utils/logic"
import {requestValidator} from "../../../../utils/auth"
import {getBody, renderError, renderJson} from "../../../../utils/web"

/**
 * Delete the specified recipe from the user's automations.
 */
export default defineEventHandler(async (event) => {
    try {
        const userId = getRouterParam(event, "userId", {decode: true})
        const recipeId = getRouterParam(event, "recipeId", {decode: true})
        await requestValidator(event)

        const user = await users.getById(userId)
        if (!user) {
            return renderError(event, `User ${userId} not found`, 404)
        }

        const body = await getBody(event)
        const recipe = await upsertUserRecipe(user, body, event.req.method, recipeId)
        return renderJson(event, recipe)
    } catch (ex) {
        return renderError(event, ex, ex.status)
    }
})
