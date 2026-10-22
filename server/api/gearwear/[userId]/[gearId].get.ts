// Strautomator API: GearWear configuration

import {defineEventHandler, getRouterParam} from "nuxt/server"
import {requestValidator} from "../../../utils/auth"
import {getGearwearById} from "../../../utils/logic"
import {renderError, renderJson} from "../../../utils/web"

/**
 * Get the specified GearWear configuration.
 */
export default defineEventHandler(async (event) => {
    try {
        const user = await requestValidator(event)
        const gearId = getRouterParam(event, "gearId", {decode: true})
        const result = await getGearwearById(user, gearId)
        return renderJson(event, result)
    } catch (ex) {
        return renderError(event, ex, ex.status)
    }
})
