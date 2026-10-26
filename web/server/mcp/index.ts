// Strautomator MCP HTTP handlers

import {emptyResponse} from "./utils"
import type {RequestEvent} from "nuxt/server"

export {consentPage} from "./html"
export {handleMcp} from "./protocol"
export * as oauth from "./oauth"

/**
 * Shared CORS preflight response for MCP and OAuth routes.
 */
export const corsPreflight = (event: RequestEvent): Response => {
    return emptyResponse(event, 204)
}
