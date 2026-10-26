// Strautomator API: Update user recipe ordering

import {users} from "strautomator-core"
import {defineEventHandler} from "nuxt/server"
import {requestValidator} from "../../../../utils/auth"
import {getBody, renderError, renderJson} from "../../../../utils/web"

/**
 * Update the ordering of recipes for a user.
 */
export default defineEventHandler(async (event) => {
    try {
        const user = await requestValidator(event)
        const recipesOrder = await getBody(event)
        await users.setRecipesOrder(user, recipesOrder)

        return renderJson(event, {ok: true})
    } catch (ex) {
        return renderError(event, ex)
    }
})
