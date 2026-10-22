// Strautomator MCP OAuth consent endpoint

import {defineEventHandler} from "nuxt/server"
import {authorize} from "../../../mcp/oauth"

/**
 * Record the MCP OAuth consent decision.
 */
export default defineEventHandler((event) => {
    return authorize(event)
})
