// Strautomator MCP OAuth CORS preflight

import {defineEventHandler} from "nuxt/server"
import {corsPreflight} from "../../mcp"

/**
 * Handle OAuth root CORS preflight requests.
 */
export default defineEventHandler((event) => {
    return corsPreflight(event)
})
