// Strautomator API: User shared recipes

import {recipes} from "strautomator-core"
import {defineEventHandler} from "nuxt/server"
import {requestValidator} from "../../../utils/auth"
import {renderError, renderJson} from "../../../utils/web"

/**
 * Get all shared recipes for the logged user.
 */
export default defineEventHandler(async (event) => {
    try {
        const user = await requestValidator(event)
        const result = await recipes.getUserSharedRecipes(user)
        return renderJson(event, result)
    } catch (ex) {
        return renderError(event, ex)
    }
})
