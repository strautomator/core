// Strautomator MCP OAuth protected resource metadata

import {defineEventHandler} from "nuxt/server"
import {protectedResourceMetadata} from "../../../mcp/oauth"

/**
 * Return MCP protected resource metadata below /mcp.
 */
export default defineEventHandler((event) => {
    return protectedResourceMetadata(event)
})
