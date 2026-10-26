// Strautomator API: Update user FIT device names

import {users} from "strautomator-core"
import {defineEventHandler} from "nuxt/server"
import {requestValidator} from "../../../utils/auth"
import {getBody, renderError, renderJson} from "../../../utils/web"
import _ from "lodash"

/**
 * Update the FIT device names given by the user. Passing null will clear all device names.
 */
export default defineEventHandler(async (event) => {
    try {
        const user = await requestValidator(event)
        const body = await getBody(event)

        if (body && Object.keys(body).length > 0) {
            const deviceNames = _.assign(user.fitDeviceNames || {}, body)
            await users.setFitDeviceNames(user, deviceNames)
            user.fitDeviceNames = deviceNames
        } else {
            await users.setFitDeviceNames(user, null)
        }

        return renderJson(event, user.fitDeviceNames || null)
    } catch (ex) {
        return renderError(event, ex, 400)
    }
})
