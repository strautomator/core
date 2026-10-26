// Strautomator MCP Streamable HTTP endpoint

import {defineEventHandler} from "nuxt/server"
import {handleMcp} from "../../mcp/protocol"

/**
 * Handle /mcp GET, POST, DELETE and OPTIONS requests.
 */
export default defineEventHandler((event) => {
    return handleMcp(event)
})
