// Strautomator MCP OAuth protected resource metadata

import {defineEventHandler} from "nuxt/server"
import {protectedResourceMetadata} from "../../mcp/oauth"

/**
 * Return MCP protected resource metadata.
 */
export default defineEventHandler((event) => {
    return protectedResourceMetadata(event)
})
