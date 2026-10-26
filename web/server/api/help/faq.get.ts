// Strautomator API: FAQ search

import {faq} from "strautomator-core"
import {defineEventHandler, getQuery} from "nuxt/server"
import {renderError, renderJson} from "../../utils/web"

/**
 * Search for answers from the FAQ.
 */
export default defineEventHandler(async (event) => {
    try {
        const query = getQuery(event)
        const results = await faq.search(query?.q?.toString() || "")
        return renderJson(event, results)
    } catch (ex) {
        return renderError(event, ex)
    }
})
