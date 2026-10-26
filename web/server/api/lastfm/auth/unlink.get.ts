// Strautomator API: Unlink Last.fm

import {users} from "strautomator-core"
import {FieldValue} from "@google-cloud/firestore"
import {defineEventHandler} from "nuxt/server"
import {requestValidator} from "../../../utils/auth"
import {renderError, renderJson} from "../../../utils/web"

/**
 * Delete the Last.fm profile for the user account.
 */
export default defineEventHandler(async (event) => {
    try {
        const user = await requestValidator(event)
        delete user.lastfm
        await users.update({id: user.id, displayName: user.displayName, lastfm: FieldValue.delete() as any})

        return renderJson(event, {unlinked: true})
    } catch (ex) {
        return renderError(event, ex)
    }
})
