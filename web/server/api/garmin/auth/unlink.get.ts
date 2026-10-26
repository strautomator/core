// Strautomator API: Unlink Garmin

import {garmin} from "strautomator-core"
import {defineEventHandler} from "nuxt/server"
import {requestValidator} from "../../../utils/auth"
import {renderError, renderJson} from "../../../utils/web"

/**
 * Delete Garmin profile for the user account.
 */
export default defineEventHandler(async (event) => {
    try {
        const user = await requestValidator(event)
        await garmin.profiles.deleteProfile(user)
        return renderJson(event, {unlinked: true})
    } catch (ex) {
        return renderError(event, ex)
    }
})
