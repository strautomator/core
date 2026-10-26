// Strautomator MCP OAuth authorization endpoint

import {defineEventHandler} from "nuxt/server"
import {authorize} from "../../../mcp/oauth"

/**
 * Show or resume the MCP OAuth authorization flow.
 */
export default defineEventHandler((event) => {
    return authorize(event)
})
