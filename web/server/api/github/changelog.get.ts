// Strautomator API: GitHub changelog

import {database} from "strautomator-core"
import {defineEventHandler, getQuery} from "nuxt/server"
import {renderError, renderJson} from "../../utils/web"
import _ from "lodash"

/**
 * Application changelog (most recent entries only).
 */
export default defineEventHandler(async (event) => {
    try {
        const query = getQuery(event)
        const changelog = await database.appState.get("changelog")
        const releases = _.orderBy(Object.values(changelog), "datePublished", "desc")
        const limit = parseInt((query.limit as string) || "0")
        return renderJson(event, limit > 0 ? releases.slice(0, limit) : releases)
    } catch (ex) {
        return renderError(event, ex)
    }
})
