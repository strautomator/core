// Strautomator MCP OAuth CORS preflight

import {defineEventHandler} from "nuxt/server"
import {corsPreflight} from "../../../mcp"

/**
 * Handle OAuth CORS preflight requests.
 */
export default defineEventHandler((event) => {
    return corsPreflight(event)
})
