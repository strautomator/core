// Strautomator API: Unlink Wahoo

import {wahoo} from "strautomator-core"
import {defineEventHandler} from "nuxt/server"
import {requestValidator} from "../../../utils/auth"
import {renderError, renderJson} from "../../../utils/web"

/**
 * Delete Wahoo profile for the user account.
 */
export default defineEventHandler(async (event) => {
    try {
        const user = await requestValidator(event)
        await wahoo.profiles.deleteProfile(user)
        return renderJson(event, {unlinked: true})
    } catch (ex) {
        return renderError(event, ex)
    }
})
