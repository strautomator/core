// Strautomator MCP OAuth authorization server metadata

import {defineEventHandler} from "nuxt/server"
import {authorizationServerMetadata} from "../../mcp/oauth"

/**
 * Return MCP authorization server metadata.
 */
export default defineEventHandler((event) => {
    return authorizationServerMetadata(event)
})
