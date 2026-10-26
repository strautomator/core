// Strautomator MCP OAuth dynamic client registration

import {defineEventHandler} from "nuxt/server"
import {registerClient} from "../../../mcp/oauth"

/**
 * Register an MCP OAuth client.
 */
export default defineEventHandler((event) => {
    return registerClient(event)
})
