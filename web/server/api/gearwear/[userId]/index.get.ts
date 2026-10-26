// Strautomator API: User GearWear configurations

import {defineEventHandler, getQuery} from "nuxt/server"
import {requestValidator} from "../../../utils/auth"
import {getGearwearByUser} from "../../../utils/logic"
import {renderError, renderJson} from "../../../utils/web"

/**
 * Get GearWear configurations for the user.
 */
export default defineEventHandler(async (event) => {
    try {
        const user = await requestValidator(event)
        const query = getQuery(event)
        const result = await getGearwearByUser(user, !!query?.refresh)
        return renderJson(event, result)
    } catch (ex) {
        return renderError(event, ex)
    }
})
