// Strautomator API: Generate user archive download

import {gdpr} from "strautomator-core"
import {defineEventHandler} from "nuxt/server"
import {requestValidator} from "../../../utils/auth"
import {renderError, renderJson} from "../../../utils/web"

/**
 * User wants to download an archive of its full data.
 */
export default defineEventHandler(async (event) => {
    try {
        const user = await requestValidator(event)
        const archiveUrl = await gdpr.generateArchive(user)

        if (!archiveUrl) {
            throw new Error("Could not generate archive, please try again in a few hours")
        }

        return renderJson(event, {url: archiveUrl})
    } catch (ex) {
        return renderError(event, ex)
    }
})
