// Strautomator API: Save shared recipe

import {recipes} from "strautomator-core"
import {defineEventHandler} from "nuxt/server"
import {requestValidator} from "../../../utils/auth"
import {validateRecipeWebhookActions} from "../../../utils/urls"
import {getBody, renderError, renderJson} from "../../../utils/web"

/**
 * Create or edit a shared recipe.
 */
export default defineEventHandler(async (event) => {
    try {
        const user = await requestValidator(event)
        const data = await getBody(event)
        validateRecipeWebhookActions(data)
        const result = await recipes.setSharedRecipe(user, data)

        return renderJson(event, result)
    } catch (ex) {
        return renderError(event, ex)
    }
})
