// Strautomator API: Update user recipe stats counter

import {recipes} from "strautomator-core"
import {defineEventHandler, getRouterParam} from "nuxt/server"
import {requestValidator} from "../../../../../utils/auth"
import {getBody, renderError, renderJson} from "../../../../../utils/web"
import _ from "lodash"

/**
 * Update the counter or data counter for the specified recipe stats.
 */
export default defineEventHandler(async (event) => {
    try {
        const body = await getBody(event)
        if (!body) throw new Error("Missing counter")

        const counter = body.counter
        const recipeId = getRouterParam(event, "recipeId", {decode: true})
        const user = await requestValidator(event)

        if (!user.recipes[recipeId]) {
            throw new Error(`Invalid recipe: ${recipeId}`)
        }

        if (!_.isNil(counter) && isNaN(counter)) {
            throw new Error(`Counter is not a valid number: ${counter}`)
        }

        await recipes.stats.setCounter(user, user.recipes[recipeId], counter)
        return renderJson(event, {counter: counter})
    } catch (ex) {
        return renderError(event, ex)
    }
})
