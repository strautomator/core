// Strautomator MCP metadata CORS preflight

import {defineEventHandler} from "nuxt/server"
import {corsPreflight} from "../../../mcp"

/**
 * Handle /mcp metadata CORS preflight requests.
 */
export default defineEventHandler((event) => {
    return corsPreflight(event)
})
