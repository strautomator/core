// Strautomator MCP OAuth token revocation

import {defineEventHandler} from "nuxt/server"
import {revoke} from "../../../mcp/oauth"

/**
 * Revoke an MCP OAuth token.
 */
export default defineEventHandler((event) => {
    return revoke(event)
})
