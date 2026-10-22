// Strautomator MCP OAuth token endpoint

import {defineEventHandler} from "nuxt/server"
import {token} from "../../../mcp/oauth"

/**
 * Exchange or refresh MCP OAuth tokens.
 */
export default defineEventHandler((event) => {
    return token(event)
})
