// Strautomator API: Delete battery tracker device

import {gearwear} from "strautomator-core"
import {defineEventHandler, getRouterParam} from "nuxt/server"
import {requestValidator} from "../../../../utils/auth"
import {renderError, renderJson} from "../../../../utils/web"

/**
 * Delete the specified device from the list of devices of the battery tracker.
 */
export default defineEventHandler(async (event) => {
    try {
        const user = await requestValidator(event)
        await gearwear.deleteBatteryTrackerDevice(user, getRouterParam(event, "deviceId", {decode: true}) as string)
        return renderJson(event, {deleted: true})
    } catch (ex) {
        return renderError(event, ex)
    }
})
