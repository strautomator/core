// Strautomator API: Delete GearWear configuration

import {gearwear, logHelper} from "strautomator-core"
import {defineEventHandler, getRouterParam} from "nuxt/server"
import {requestValidator} from "../../../utils/auth"
import {renderError, renderJson} from "../../../utils/web"

/**
 * Delete the specified GearWear configuration.
 */
export default defineEventHandler(async (event) => {
    try {
        const gearId = getRouterParam(event, "gearId", {decode: true})
        const user = await requestValidator(event)
        const config = await gearwear.getById(gearId)

        if (!config) {
            return renderError(event, `GearWear ${gearId} for user ${user.id} does not exist`, 404)
        }

        if (config.userId != user.id) {
            return renderError(event, `${logHelper.user(user)} has no access to GearWear ${gearId}`, 403)
        }

        await gearwear.delete(config)
        return renderJson(event, {deleted: true})
    } catch (ex) {
        return renderError(event, ex)
    }
})
