// Strautomator MCP metadata CORS preflight

import {defineEventHandler} from "nuxt/server"
import {corsPreflight} from "../../mcp"

/**
 * Handle /mcp well-known root CORS preflight requests.
 */
export default defineEventHandler((event) => {
    return corsPreflight(event)
})
