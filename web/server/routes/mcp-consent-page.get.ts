// Strautomator MCP sample consent page

import {defineEventHandler} from "nuxt/server"
import {consentPage} from "../mcp/html"
import {htmlResponse} from "../mcp/utils"

/**
 * Render the sample MCP consent page.
 */
export default defineEventHandler((event) => {
    return htmlResponse(event, consentPage({clientName: "Sample MCP client", userName: "Sample user", redirectTarget: "strautomator.com", requestId: "", consentToken: "", preview: true}), 200, false)
})
