// Strautomator MCP persistence (Firestore)

import {database} from "strautomator-core"
import type {McpAuthCode, McpAuthRequest, McpOAuthClient, McpToken} from "./types"
import {getMcpConfig, hashToken, randomToken} from "./utils"
import dayjs from "../utils/dayjs"
import _ from "lodash"
import logger from "anyhow"

type McpDocType = "client" | "request" | "code" | "token"

/**
 * Firestore document ID for the specified data type and ID.
 */
const docId = (type: McpDocType, id: string): string => `${type}-${id}`

/**
 * Strip the data type prefix from the ID of a loaded document.
 */
const fromDoc = <T extends {id: string}>(type: McpDocType, doc: T): T => {
    if (doc) {
        doc.id = doc.id.substring(type.length + 1)
    }
    return doc
}

/**
 * Whether a persisted document has passed its dateExpiry.
 */
const isExpired = (doc: {dateExpiry?: Date}): boolean => {
    if (!doc?.dateExpiry) {
        return true
    }
    return dayjs(doc.dateExpiry).isBefore(dayjs())
}

/**
 * MCP OAuth store backed by Firestore.
 */
export class McpStore {
    private constructor() {}
    private static _instance: McpStore
    static get Instance() {
        return this._instance || (this._instance = new this())
    }

    // CLIENTS
    // --------------------------------------------------------------------------

    /**
     * Persist a dynamically registered OAuth client.
     */
    saveClient = async (client: McpOAuthClient): Promise<void> => {
        await database.set("mcp", client, docId("client", client.id))
        logger.info("MCP.saveClient", client.id, client.clientName || "unnamed", client.tokenEndpointAuthMethod)
    }

    /**
     * Load a registered client by ID. Expired registrations are deleted and return null.
     */
    getClient = async (clientId: string): Promise<McpOAuthClient> => {
        if (!clientId) {
            return null
        }

        const client: McpOAuthClient = fromDoc("client", await database.get("mcp", docId("client", clientId)))
        if (!client) {
            return null
        }
        if (isExpired(client)) {
            await database.delete("mcp", docId("client", clientId))
            return null
        }

        return client
    }

    /**
     * Mark the client as used, extending its registration to the full lifetime.
     */
    activateClient = async (client: McpOAuthClient): Promise<void> => {
        if (client.dateActivated) {
            return
        }

        const now = dayjs()
        const config = getMcpConfig()
        client.dateActivated = now.toDate()
        client.dateExpiry = now.add(config.clientDays, "days").toDate()
        await database.merge("mcp", {dateActivated: client.dateActivated, dateExpiry: client.dateExpiry}, database.doc("mcp", docId("client", client.id)))
        logger.info("MCP.activateClient", client.id, client.clientName || "unnamed")
    }

    // AUTH REQUESTS
    // --------------------------------------------------------------------------

    /**
     * Save a pending authorization request while the user signs in or reviews consent.
     */
    saveAuthRequest = async (request: McpAuthRequest): Promise<void> => {
        await database.set("mcp", request, docId("request", request.id))
    }

    /**
     * Load a pending authorization request. Expired requests are deleted and return null.
     */
    getAuthRequest = async (id: string): Promise<McpAuthRequest> => {
        if (!id) {
            return null
        }

        const request: McpAuthRequest = fromDoc("request", await database.get("mcp", docId("request", id)))
        if (!request) {
            return null
        }
        if (isExpired(request)) {
            await database.delete("mcp", docId("request", id))
            return null
        }

        return request
    }

    /**
     * Remove a pending authorization request after consent or denial.
     */
    deleteAuthRequest = async (id: string): Promise<void> => {
        try {
            await database.delete("mcp", docId("request", id))
        } catch (ex) {
            logger.warn("MCP.deleteAuthRequest", id, ex)
        }
    }

    // AUTH CODES
    // --------------------------------------------------------------------------

    /**
     * Issue a single-use authorization code. Only the SHA-256 hash is stored.
     */
    issueAuthCode = async (data: Omit<McpAuthCode, "id">): Promise<string> => {
        const code = randomToken(32)
        const doc: McpAuthCode = {id: hashToken(code), ...data}
        await database.set("mcp", doc, docId("code", doc.id))
        return code
    }

    /**
     * Load an authorization code without consuming it. Expired codes are deleted and return null.
     */
    getAuthCode = async (code: string): Promise<McpAuthCode> => {
        if (!code) {
            return null
        }

        const id = hashToken(code)
        const doc: McpAuthCode = fromDoc("code", await database.get("mcp", docId("code", id)))
        if (!doc) {
            return null
        }
        if (isExpired(doc)) {
            await database.delete("mcp", docId("code", id))
            return null
        }

        return doc
    }

    /**
     * Consume an authorization code after the token request has been fully validated.
     * Uses a Firestore transaction so only one concurrent exchange can succeed.
     */
    consumeAuthCode = async (code: string): Promise<McpAuthCode> => {
        if (!code) {
            return null
        }

        const id = hashToken(code)

        return database.runTransaction(async (tx) => {
            const doc: McpAuthCode = fromDoc("code", await tx.get("mcp", docId("code", id)))
            if (!doc) {
                return null
            }

            tx.delete("mcp", docId("code", id))
            if (isExpired(doc)) {
                return null
            }

            return doc
        })
    }

    // TOKENS
    // --------------------------------------------------------------------------

    /**
     * Issue a new access/refresh token pair. Previous tokens for the same grant are not affected
     * until the refresh token is consumed or revoked.
     */
    issueTokens = async (data: {clientId: string; userId: string; resource: string; scope: string}): Promise<{accessToken: string; refreshToken: string; expiresIn: number}> => {
        const config = getMcpConfig()
        const accessToken = `mcp_at_${randomToken(32)}`
        const refreshToken = `mcp_rt_${randomToken(32)}`
        const accessId = hashToken(accessToken)
        const refreshId = hashToken(refreshToken)
        const now = dayjs()

        const access: McpToken = {
            id: accessId,
            type: "access",
            clientId: data.clientId,
            userId: data.userId,
            resource: data.resource,
            scope: data.scope,
            refreshId,
            dateExpiry: now.add(config.accessTokenHours, "hours").toDate()
        }
        const refresh: McpToken = {
            id: refreshId,
            type: "refresh",
            clientId: data.clientId,
            userId: data.userId,
            resource: data.resource,
            scope: data.scope,
            accessId,
            dateExpiry: now.add(config.refreshTokenDays, "days").toDate()
        }

        await database.set("mcp", access, docId("token", access.id))
        await database.set("mcp", refresh, docId("token", refresh.id))

        return {accessToken, refreshToken, expiresIn: config.accessTokenHours * 3600}
    }

    /**
     * Validate a bearer access token for MCP requests. Expired tokens are deleted on read.
     */
    getAccessToken = async (accessToken: string): Promise<McpToken> => {
        if (!accessToken) {
            return null
        }

        const id = hashToken(accessToken)
        const doc: McpToken = fromDoc("token", await database.get("mcp", docId("token", id)))
        if (!doc || doc.type != "access") {
            return null
        }
        if (isExpired(doc)) {
            await database.delete("mcp", docId("token", id))
            return null
        }

        return doc
    }

    /**
     * Load a refresh token without consuming it. Expired tokens are deleted and return null.
     */
    getRefreshToken = async (refreshToken: string): Promise<McpToken> => {
        if (!refreshToken) {
            return null
        }

        const id = hashToken(refreshToken)
        const doc: McpToken = fromDoc("token", await database.get("mcp", docId("token", id)))
        if (!doc || doc.type != "refresh") {
            return null
        }
        if (isExpired(doc)) {
            await database.delete("mcp", docId("token", id))
            return null
        }

        return doc
    }

    /**
     * Consume a refresh token (rotation). Deletes the refresh token and its paired access token
     * inside a Firestore transaction so only one concurrent refresh can succeed.
     */
    consumeRefreshToken = async (refreshToken: string): Promise<McpToken> => {
        if (!refreshToken) {
            return null
        }

        const id = hashToken(refreshToken)

        return database.runTransaction(async (tx) => {
            const doc: McpToken = fromDoc("token", await tx.get("mcp", docId("token", id)))
            if (!doc || doc.type != "refresh") {
                return null
            }

            tx.delete("mcp", docId("token", id))
            if (doc.accessId) {
                tx.delete("mcp", docId("token", doc.accessId))
            }
            if (isExpired(doc)) {
                return null
            }

            return doc
        })
    }

    /**
     * Revoke an access or refresh token and its paired token, if present.
     */
    revokeToken = async (token: string): Promise<void> => {
        if (!token) {
            return
        }

        const id = hashToken(token)
        const doc: McpToken = await database.get("mcp", docId("token", id))
        if (!doc) {
            return
        }

        await database.delete("mcp", docId("token", id))
        const pairedId = doc.type == "access" ? doc.refreshId : doc.accessId
        if (pairedId) {
            try {
                await database.delete("mcp", docId("token", pairedId))
            } catch (ex) {
                logger.warn("MCP.revokeToken", "Failed to delete paired token", ex)
            }
        }
    }

    // USER SESSIONS
    // --------------------------------------------------------------------------

    /**
     * List the active MCP sessions (one per non-expired refresh token) for the specified user.
     */
    getUserSessions = async (userId: string): Promise<{clientId: string; clientName: string; dateLastAuth: Date; dateExpiry: Date}[]> => {
        const config = getMcpConfig()
        const tokens: McpToken[] = await database.search("mcp", [
            ["userId", "==", userId],
            ["type", "==", "refresh"]
        ])
        const active = tokens.filter((t) => !isExpired(t))
        const clients = await Promise.all(_.uniq(active.map((t) => t.clientId)).map((id) => this.getClient(id)))

        return Object.entries(_.groupBy(active, "clientId")).map(([clientId, clientTokens]) => {
            const client = clients.find((c) => c?.id == clientId)
            const latest = _.maxBy(clientTokens, (t) => dayjs(t.dateExpiry).valueOf())
            return {
                clientId: clientId,
                clientName: client?.clientName || "Unnamed client",
                // Refresh tokens rotate on every refresh, so issue date = expiry minus lifetime.
                dateLastAuth: dayjs(latest.dateExpiry).subtract(config.refreshTokenDays, "days").toDate(),
                dateExpiry: latest.dateExpiry
            }
        })
    }

    /**
     * Revoke all tokens and codes issued to the specified client for the user.
     */
    revokeUserClient = async (userId: string, clientId: string): Promise<number> => {
        const count = await database.delete("mcp", [
            ["userId", "==", userId],
            ["clientId", "==", clientId]
        ])
        logger.info("MCP.revokeUserClient", `User ${userId}`, `Client ${clientId}`, `Deleted ${count} grants`)
        return count
    }

    /*
     * Revoke all MCP grants for a user who is no longer PRO or who has been deleted.
     */
    revokeUser = async (userId: string): Promise<void> => {
        await database.delete("mcp", ["userId", "==", userId])
        logger.info("MCP.revokeUser", `User ${userId}`, "Revoked all MCP grants")
    }
}

export default McpStore.Instance
