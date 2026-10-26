// Strautomator API: List active MCP client sessions

import {defineEventHandler} from "nuxt/server"
import {requestValidator} from "../../../../../utils/auth"
import {renderError, renderJson} from "../../../../../utils/web"
import mcpStore from "../../../../../mcp/store"

/**
 * List the user's active MCP client sessions.
 */
export default defineEventHandler(async (event) => {
    try {
        const user = await requestValidator(event)
        const sessions = await mcpStore.getUserSessions(user.id)

        return renderJson(event, sessions)
    } catch (ex) {
        return renderError(event, ex)
    }
})
