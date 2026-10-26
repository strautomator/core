// Strautomator MCP Streamable HTTP / JSON-RPC

import {users} from "strautomator-core"
import type {UserData} from "strautomator-core"
import {getRequestHeader, type RequestEvent} from "nuxt/server"
import store from "./store"
import {callTool, listTools} from "./tools"
import type {JsonRpcRequest, JsonRpcResponse} from "./types"
import {emptyResponse, getMcpConfig, jsonResponse, setCorsHeaders, setWwwAuthenticate, withHeaders} from "./utils"
import {getBody} from "../utils/web"
import logger from "anyhow"
import packageJson from "../../package.json"

// Maximum number of JSON-RPC messages accepted in a single batch.
const maxBatchSize = 20

/**
 * Build a JSON-RPC 2.0 error response.
 */
const jsonRpcError = (id: JsonRpcRequest["id"], code: number, message: string): JsonRpcResponse => {
    return {jsonrpc: "2.0", id: id ?? null, error: {code, message}}
}

/**
 * Authenticate the MCP request using the OAuth bearer token issued by this server.
 * Strava tokens are never accepted here.
 */
const authenticateRequest = async (event: RequestEvent): Promise<{user?: UserData; response?: Response}> => {
    const header = getRequestHeader(event, "authorization") || ""
    const match = header.match(/^Bearer\s+(.+)$/i)
    if (!match) {
        const response = jsonResponse(event, {error: "invalid_token", error_description: "Missing bearer token"}, 401)
        setWwwAuthenticate(event, response)
        return {response}
    }

    const token = await store.getAccessToken(match[1].trim())
    const config = getMcpConfig()
    if (!token || token.resource.replace(/\/+$/, "") != config.resource.replace(/\/+$/, "")) {
        const response = jsonResponse(event, {error: "invalid_token", error_description: "Invalid or expired access token"}, 401)
        setWwwAuthenticate(event, response, 'error="invalid_token"')
        return {response}
    }

    const user = await users.getById(token.userId)
    if (!user) {
        const response = jsonResponse(event, {error: "invalid_token", error_description: "User not found"}, 401)
        setWwwAuthenticate(event, response, 'error="invalid_token"')
        return {response}
    }
    if (!user.isPro) {
        return {response: jsonResponse(event, {error: "insufficient_scope", error_description: "The Strautomator MCP server is available to PRO members only"}, 403)}
    }

    return {user}
}

/**
 * Dispatch a single JSON-RPC message for the authenticated user.
 */
const handleRpc = async (user: UserData, message: JsonRpcRequest): Promise<JsonRpcResponse> => {
    const id = message?.id ?? null
    if (!message || message.jsonrpc != "2.0" || !message.method) {
        return jsonRpcError(id, -32600, "Invalid Request")
    }

    const config = getMcpConfig()

    if (message.method == "initialize") {
        const requested = message.params?.protocolVersion
        const protocolVersion = config.protocolVersions.includes(requested) ? requested : config.protocolVersions[0]
        return {
            jsonrpc: "2.0",
            id,
            result: {
                protocolVersion,
                capabilities: {tools: {listChanged: false}},
                serverInfo: {name: "strautomator", title: "Strautomator", version: packageJson.version},
                instructions:
                    "Strautomator MCP for PRO subscribers. Tools operate on the authenticated athlete and match the website API. Use get_automation_schema before handling automations. Use list_gearwear or get_gearwear for gear IDs and exact component names before toggle_gearwear_component. Never ask the user for Strautomator or Strava tokens."
            }
        }
    }

    if (message.method == "ping") {
        return {jsonrpc: "2.0", id, result: {}}
    }

    if (message.method == "tools/list") {
        return {jsonrpc: "2.0", id, result: {tools: listTools()}}
    }

    if (message.method == "tools/call") {
        const name = message.params?.name
        const args = message.params?.arguments || {}
        if (!name) {
            return jsonRpcError(id, -32602, "Missing tool name")
        }
        const result = await callTool(user, name, args)
        return {jsonrpc: "2.0", id, result}
    }

    // Client notifications do not expect a response.
    if (message.method == "notifications/initialized" || message.method.startsWith("notifications/")) {
        return null
    }

    // Advertise empty resource and prompt lists (tools-only server).
    if (message.method == "resources/list") {
        return {jsonrpc: "2.0", id, result: {resources: []}}
    }
    if (message.method == "prompts/list") {
        return {jsonrpc: "2.0", id, result: {prompts: []}}
    }

    return jsonRpcError(id, -32601, `Method not found: ${message.method}`)
}

/**
 * Handle MCP Streamable HTTP requests (/mcp).
 */
export const handleMcp = async (event: RequestEvent): Promise<Response> => {
    setCorsHeaders(event)

    if (event.req.method == "OPTIONS") {
        return emptyResponse(event, 204)
    }

    // Stateless server: only POST carries JSON-RPC payloads.
    if (event.req.method != "POST") {
        return withHeaders(jsonResponse(event, {error: "method_not_allowed", error_description: "This MCP server is stateless and only accepts POST"}, 405), {Allow: "POST, OPTIONS"})
    }

    const auth = await authenticateRequest(event)
    if (!auth.user) {
        return auth.response
    }

    const user = auth.user
    try {
        const body = await getBody(event)
        const batch = Array.isArray(body)
        const messages: JsonRpcRequest[] = batch ? body : [body]
        const responses: JsonRpcResponse[] = []

        // Each message may call tools that hit Strava and the database, so batches are capped.
        if (messages.length == 0 || messages.length > maxBatchSize) {
            return jsonResponse(event, jsonRpcError(null, -32600, `Invalid Request: batches must have 1 to ${maxBatchSize} messages`), 400)
        }

        for (const message of messages) {
            const isNotification = message && message.id === undefined && typeof message.method == "string" && (message.method.startsWith("notifications/") || message.method == "initialized")
            const response = await handleRpc(user, message)
            if (response && !isNotification) {
                responses.push(response)
            }
        }

        // Notification-only batches return 202 with no body.
        if (responses.length == 0) {
            return emptyResponse(event, 202)
        }

        return jsonResponse(event, batch ? responses : responses[0])
    } catch (ex) {
        logger.error("McpProtocol.handleMcp", user.id, ex)
        return jsonResponse(event, {jsonrpc: "2.0", id: null, error: {code: -32603, message: "Internal error"}}, 500)
    }
}
