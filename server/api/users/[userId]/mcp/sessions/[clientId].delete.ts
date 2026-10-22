// Strautomator API: Revoke MCP client session tokens

import {defineEventHandler, getRouterParam} from "nuxt/server"
import {requestValidator} from "../../../../../utils/auth"
import {renderError, renderJson} from "../../../../../utils/web"
import mcpStore from "../../../../../mcp/store"

/**
 * Revoke all MCP tokens issued to the specified client for the user.
 */
export default defineEventHandler(async (event) => {
    try {
        const user = await requestValidator(event)
        const count = await mcpStore.revokeUserClient(user.id, getRouterParam(event, "clientId", {decode: true}))

        return renderJson(event, {revoked: count})
    } catch (ex) {
        return renderError(event, ex)
    }
})
