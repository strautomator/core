// Strautomator MCP OAuth 2.1 authorization server

import {users} from "strautomator-core"
import type {UserData} from "strautomator-core"
import {getQuery, getRequestHeader, sendRedirect, type RequestEvent} from "nuxt/server"
import {consentPage, errorPage, proRequiredPage} from "./html"
import store from "./store"
import type {McpAuthRequest, McpOAuthClient} from "./types"
import {emptyResponse, firstString, getMcpConfig, hashToken, htmlResponse, isValidRedirectUri, jsonResponse, randomToken, setCorsHeaders, verifyPkce, withHeaders} from "./utils"
import {getBody, getClientIP} from "../utils/web"
import {loadSession} from "../utils/session"
import crypto from "crypto"
import logger from "anyhow"
import dayjs from "../utils/dayjs"

/** Grant types advertised and accepted by this authorization server. */
const supportedGrantTypes = ["authorization_code", "refresh_token"]
/** Response types supported on the authorize endpoint. */
const supportedResponseTypes = ["code"]
/** Token endpoint client authentication methods (public clients use "none"). */
const supportedAuthMethods = ["none", "client_secret_post", "client_secret_basic"]
/** Dynamic client registration rate-limit window. */
const registerWindowMs = 3600000
/** Dynamic client registration counters per IP. */
const registerHits: Map<string, {count: number; resetAt: number}> = new Map()
let lastRegisterCleanup = Date.now()

/**
 * Redirect back to the MCP client with OAuth query parameters (code or error).
 */
const oauthRedirect = (event: RequestEvent, redirectUri: string, params: Record<string, string>): string => {
    const url = new URL(redirectUri)
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null && value !== "") {
            url.searchParams.set(key, value)
        }
    }
    setCorsHeaders(event)
    return sendRedirect(event, url.toString(), 302)
}

/**
 * Send a JSON OAuth error response.
 */
const oauthErrorJson = (event: RequestEvent, status: number, error: string, description: string): Response => {
    return jsonResponse(event, {error, error_description: description}, status)
}

/**
 * Parse client_id and client_secret from an HTTP Basic Authorization header.
 */
const parseBasicClient = (event: RequestEvent): {clientId?: string; clientSecret?: string} => {
    const header = getRequestHeader(event, "authorization") || ""
    if (!header.toLowerCase().startsWith("basic ")) {
        return {}
    }

    try {
        const decoded = Buffer.from(header.substring(6).trim(), "base64").toString("utf8")
        const idx = decoded.indexOf(":")
        if (idx < 0) {
            return {clientId: decoded}
        }
        return {clientId: decoded.substring(0, idx), clientSecret: decoded.substring(idx + 1)}
    } catch {
        return {}
    }
}

/**
 * Authenticate the OAuth client on the token and revoke endpoints.
 * Public clients (token_endpoint_auth_method "none") skip secret validation.
 */
const authenticateClient = async (event: RequestEvent): Promise<{client: McpOAuthClient; error?: string}> => {
    const body = await getBody(event)
    const basic = parseBasicClient(event)
    const clientId = firstString(body?.client_id) || basic.clientId
    const clientSecret = firstString(body?.client_secret) || basic.clientSecret
    const client = await store.getClient(clientId)

    if (!client) {
        return {client: null, error: "invalid_client"}
    }

    if (client.tokenEndpointAuthMethod == "none") {
        return {client}
    }

    if (!client.clientSecretHash || !clientSecret) {
        return {client: null, error: "invalid_client"}
    }
    const expected = Buffer.from(client.clientSecretHash)
    const actual = Buffer.from(hashToken(clientSecret))
    if (expected.length != actual.length || !crypto.timingSafeEqual(expected, actual)) {
        return {client: null, error: "invalid_client"}
    }

    return {client}
}

/**
 * Resolve the logged-in Strautomator user from the Strava session cookie.
 * Returns null when the user has not signed in yet.
 */
const getLoggedUser = async (event: RequestEvent): Promise<UserData> => {
    const config = getMcpConfig()
    const session = loadSession(event)
    const userId = session.content.userId || config.assumeUser
    if (!userId) {
        return null
    }

    try {
        return await users.getById(userId)
    } catch (ex) {
        logger.warn("MCP.getLoggedUser", userId, ex)
        return null
    }
}

/**
 * Compare two resource indicator URIs, ignoring trailing slashes.
 */
const resourceMatches = (requested: string, expected: string): boolean => {
    if (!requested) {
        return true
    }
    const a = requested.replace(/\/+$/, "")
    const b = expected.replace(/\/+$/, "")
    return a == b
}

/**
 * Return dynamic client registration rate-limit headers and optional 429 response.
 */
const checkRegisterRateLimit = (event: RequestEvent): {headers: Record<string, string | number>; response?: Response} => {
    const config = getMcpConfig()
    const max = config.registerPerHour
    if (!max) {
        return {headers: {}}
    }

    const now = Date.now()
    if (now - lastRegisterCleanup > registerWindowMs) {
        lastRegisterCleanup = now
        for (const [key, value] of registerHits) {
            if (value.resetAt <= now) registerHits.delete(key)
        }
    }

    const ip = getClientIP(event)
    let entry = registerHits.get(ip)
    if (!entry || entry.resetAt <= now) {
        entry = {count: 0, resetAt: now + registerWindowMs}
        registerHits.set(ip, entry)
    }
    entry.count++

    const headers = {
        "RateLimit-Policy": `${max};w=${Math.ceil(registerWindowMs / 1000)}`,
        "RateLimit-Limit": max,
        "RateLimit-Remaining": Math.max(max - entry.count, 0),
        "RateLimit-Reset": Math.ceil((entry.resetAt - now) / 1000)
    }

    if (entry.count > max) {
        logger.warn("MCP.registerClient", `From: ${ip}`, "Rate limited")
        return {headers, response: withHeaders(jsonResponse(event, {error: "temporarily_unavailable", error_description: "Too many client registrations, please try again later"}, 429), headers)}
    }

    return {headers}
}

/**
 * Add no-store headers required on token responses.
 */
const tokenResponse = (event: RequestEvent, data: any, status?: number): Response => {
    return withHeaders(jsonResponse(event, data, status), {"Cache-Control": "no-store", Pragma: "no-cache"})
}

/**
 * Protected resource metadata (RFC 9728).
 */
export const protectedResourceMetadata = (event: RequestEvent): Response => {
    const config = getMcpConfig()
    return jsonResponse(event, {
        resource: config.resource,
        authorization_servers: [config.issuer],
        bearer_methods_supported: ["header"],
        scopes_supported: [config.scope],
        resource_name: "Strautomator MCP"
    })
}

/**
 * Authorization server metadata (RFC 8414).
 */
export const authorizationServerMetadata = (event: RequestEvent): Response => {
    const config = getMcpConfig()
    return jsonResponse(event, {
        issuer: config.issuer,
        authorization_endpoint: `${config.issuer}/mcp/oauth/authorize`,
        token_endpoint: `${config.issuer}/mcp/oauth/token`,
        registration_endpoint: `${config.issuer}/mcp/oauth/register`,
        revocation_endpoint: `${config.issuer}/mcp/oauth/revoke`,
        scopes_supported: [config.scope],
        response_types_supported: supportedResponseTypes,
        grant_types_supported: supportedGrantTypes,
        token_endpoint_auth_methods_supported: supportedAuthMethods,
        revocation_endpoint_auth_methods_supported: supportedAuthMethods,
        code_challenge_methods_supported: ["S256"],
        resource_indicators_supported: true
    })
}

/**
 * Dynamic client registration (RFC 7591).
 */
export const registerClient = async (event: RequestEvent): Promise<Response> => {
    const rateLimit = checkRegisterRateLimit(event)
    if (rateLimit.response) {
        return rateLimit.response
    }

    try {
        const body = (await getBody(event)) || {}
        const redirectUris: string[] = Array.isArray(body.redirect_uris) ? body.redirect_uris : []
        if (redirectUris.length < 1) {
            return withHeaders(oauthErrorJson(event, 400, "invalid_redirect_uri", "redirect_uris is required"), rateLimit.headers)
        }
        if (redirectUris.length > getMcpConfig().maxRedirectUris) {
            return withHeaders(oauthErrorJson(event, 400, "invalid_redirect_uri", "Too many redirect_uris"), rateLimit.headers)
        }
        if (redirectUris.some((uri) => !isValidRedirectUri(uri))) {
            return withHeaders(oauthErrorJson(event, 400, "invalid_redirect_uri", "One or more redirect_uris are not allowed"), rateLimit.headers)
        }

        const grantTypes: string[] = Array.isArray(body.grant_types) && body.grant_types.length > 0 ? body.grant_types : ["authorization_code", "refresh_token"]
        if (grantTypes.some((g) => !supportedGrantTypes.includes(g))) {
            return withHeaders(oauthErrorJson(event, 400, "invalid_client_metadata", "Unsupported grant_types"), rateLimit.headers)
        }

        const responseTypes: string[] = Array.isArray(body.response_types) && body.response_types.length > 0 ? body.response_types : ["code"]
        if (responseTypes.some((r) => !supportedResponseTypes.includes(r))) {
            return withHeaders(oauthErrorJson(event, 400, "invalid_client_metadata", "Unsupported response_types"), rateLimit.headers)
        }

        let tokenEndpointAuthMethod = firstString(body.token_endpoint_auth_method) || "none"
        if (!supportedAuthMethods.includes(tokenEndpointAuthMethod)) {
            return withHeaders(oauthErrorJson(event, 400, "invalid_client_metadata", "Unsupported token_endpoint_auth_method"), rateLimit.headers)
        }

        const config = getMcpConfig()
        const now = dayjs()
        const clientName = firstString(body.client_name).substring(0, 120)
        const clientSlug = clientName
            .normalize("NFKD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")

        const clientId = `${clientSlug || "client"}-${crypto.randomBytes(8).toString("hex")}`
        const confidential = tokenEndpointAuthMethod != "none"
        const clientSecret = confidential ? randomToken(32) : null

        const client: McpOAuthClient = {
            id: clientId,
            clientName: clientName || undefined,
            clientSecretHash: clientSecret ? hashToken(clientSecret) : undefined,
            tokenEndpointAuthMethod: tokenEndpointAuthMethod as McpOAuthClient["tokenEndpointAuthMethod"],
            redirectUris,
            grantTypes,
            responseTypes,
            dateIssued: now.toDate(),
            dateExpiry: now.add(config.unusedClientHours, "hours").toDate()
        }

        await store.saveClient(client)

        const result: any = {
            client_id: client.id,
            client_id_issued_at: now.unix(),
            // Public clients have no secret (0). Confidential clients expire with the registration,
            // which is extended to the full lifetime once the client is used for the first time.
            client_secret_expires_at: confidential ? dayjs(client.dateExpiry).unix() : 0,
            redirect_uris: client.redirectUris,
            grant_types: client.grantTypes,
            response_types: client.responseTypes,
            token_endpoint_auth_method: client.tokenEndpointAuthMethod,
            client_name: client.clientName
        }
        if (clientSecret) {
            result.client_secret = clientSecret
        }

        logger.info("MCP.registerClient", client.id, client.clientName || "unnamed", `${redirectUris.length} redirect URIs`)
        return withHeaders(jsonResponse(event, result, 201), rateLimit.headers)
    } catch (ex) {
        logger.error("MCP.registerClient", ex)
        return withHeaders(oauthErrorJson(event, 500, "server_error", "Failed to register client"), rateLimit.headers)
    }
}

/**
 * Validate the authorize query string and persist a pending authorization request.
 * The request survives the Strava login redirect and is referenced by request_id.
 */
const createAuthRequest = async (event: RequestEvent): Promise<{request?: McpAuthRequest; error?: string; description?: string; redirectUri?: string; state?: string}> => {
    const config = getMcpConfig()
    const query = getQuery(event)
    const clientId = firstString(query.client_id)
    const redirectUri = firstString(query.redirect_uri)
    const responseType = firstString(query.response_type) || "code"
    const state = firstString(query.state)
    const codeChallenge = firstString(query.code_challenge)
    const codeChallengeMethod = firstString(query.code_challenge_method)
    const resource = firstString(query.resource) || config.resource
    const client = await store.getClient(clientId)
    if (!client) {
        return {error: "invalid_client", description: "Unknown client_id"}
    }
    if (!client.redirectUris.includes(redirectUri)) {
        return {error: "invalid_request", description: "redirect_uri is not registered for this client"}
    }
    if (responseType != "code") {
        return {error: "unsupported_response_type", description: "Only response_type=code is supported", redirectUri, state}
    }
    if (!codeChallenge || codeChallengeMethod.toUpperCase() != "S256") {
        return {error: "invalid_request", description: "PKCE S256 is required", redirectUri, state}
    }
    if (!resourceMatches(resource, config.resource)) {
        return {error: "invalid_target", description: "resource does not match this MCP server", redirectUri, state}
    }

    const request: McpAuthRequest = {
        id: randomToken(18),
        clientId: client.id,
        redirectUri,
        state,
        codeChallenge,
        codeChallengeMethod: "S256",
        resource: config.resource,
        scope: config.scope,
        consentToken: randomToken(18),
        dateExpiry: dayjs().add(config.authRequestMinutes, "minutes").toDate()
    }
    await store.saveAuthRequest(request)
    return {request}
}

/**
 * Authorization endpoint (authorization code + PKCE).
 * GET shows the consent page; POST records the user's decision.
 */
export const authorize = async (event: RequestEvent): Promise<Response | string> => {
    const config = getMcpConfig()

    try {
        let request: McpAuthRequest
        const body = await getBody(event)
        const query = getQuery(event)
        const requestId = firstString(body?.request_id) || firstString(query.request_id)

        if (requestId) {
            // Resume a pending request (after Strava login or after the canonical redirect).
            request = await store.getAuthRequest(requestId)
            if (!request) {
                return htmlResponse(event, errorPage("Authorization expired", "This authorization request is no longer valid. Start the connection again from your MCP client."), 400)
            }
        } else if (event.req.method == "GET") {
            // First visit from the MCP client: validate params, persist, then redirect to a stable URL.
            const created = await createAuthRequest(event)
            if (created.error) {
                if (created.redirectUri) {
                    return oauthRedirect(event, created.redirectUri, {error: created.error, error_description: created.description, state: created.state, iss: config.issuer})
                }
                return htmlResponse(event, errorPage("Invalid request", created.description || created.error), 400)
            }
            // Canonical URL so refreshing the consent page does not invalidate the consent_token.
            setCorsHeaders(event)
            return sendRedirect(event, `/mcp/oauth/authorize?request_id=${encodeURIComponent(created.request.id)}`, 302)
        } else {
            return htmlResponse(event, errorPage("Invalid request", "Missing authorization request."), 400)
        }

        const user = await getLoggedUser(event)
        if (!user) {
            const returnPath = `/mcp/oauth/authorize?request_id=${encodeURIComponent(request.id)}`
            setCorsHeaders(event)
            return sendRedirect(event, `/auth/login?redirect-url=${encodeURIComponent(returnPath)}`, 302)
        }
        if (!user.isPro) {
            return htmlResponse(event, proRequiredPage(), 403)
        }

        if (event.req.method == "POST") {
            const consentToken = firstString(body?.consent_token)
            const decision = firstString(body?.decision)
            if (!consentToken || !request.consentToken || hashToken(consentToken) != hashToken(request.consentToken)) {
                return htmlResponse(event, errorPage("Invalid request", "The consent form could not be validated. Please try again."), 400)
            }

            await store.deleteAuthRequest(request.id)

            if (decision != "approve") {
                return oauthRedirect(event, request.redirectUri, {error: "access_denied", error_description: "The user denied the request", state: request.state, iss: config.issuer})
            }

            const code = await store.issueAuthCode({
                clientId: request.clientId,
                userId: user.id,
                redirectUri: request.redirectUri,
                codeChallenge: request.codeChallenge,
                resource: request.resource,
                scope: request.scope,
                dateExpiry: dayjs().add(config.authCodeMinutes, "minutes").toDate()
            })

            logger.info("MCP.authorize", `User ${user.id}`, `Client ${request.clientId}`, "Authorized")
            return oauthRedirect(event, request.redirectUri, {code, state: request.state, iss: config.issuer})
        }

        const client = await store.getClient(request.clientId)
        const redirectUrl = new URL(request.redirectUri)
        const redirectTarget = redirectUrl.host ? `${redirectUrl.protocol}//${redirectUrl.host}` : redirectUrl.protocol
        return htmlResponse(event, consentPage({clientName: client?.clientName || "MCP client", userName: user.displayName || user.id, redirectTarget, requestId: request.id, consentToken: request.consentToken}))
    } catch (ex) {
        logger.error("MCP.authorize", ex)
        return htmlResponse(event, errorPage("Server error", "Could not complete the authorization request."), 500)
    }
}

/**
 * Token endpoint (authorization_code and refresh_token grants).
 */
export const token = async (event: RequestEvent): Promise<Response> => {
    try {
        const body = await getBody(event)
        const auth = await authenticateClient(event)
        if (!auth.client) {
            return withHeaders(tokenResponse(event, {error: "invalid_client", error_description: "Client authentication failed"}, 401), {"WWW-Authenticate": 'Basic realm="mcp"'})
        }

        const grantType = firstString(body?.grant_type)
        if (grantType == "authorization_code") {
            const code = firstString(body?.code)
            const redirectUri = firstString(body?.redirect_uri)
            const codeVerifier = firstString(body?.code_verifier)
            const resource = firstString(body?.resource)

            // RFC 8707: reject before touching the authorization code so the client can retry.
            if (!resource) {
                return tokenResponse(event, {error: "invalid_target", error_description: "resource parameter is required and must match the MCP server"}, 400)
            }

            const authCode = await store.getAuthCode(code)
            if (!authCode || authCode.clientId != auth.client.id) {
                return tokenResponse(event, {error: "invalid_grant", error_description: "Invalid authorization code"}, 400)
            }
            if (authCode.redirectUri != redirectUri) {
                return tokenResponse(event, {error: "invalid_grant", error_description: "redirect_uri mismatch"}, 400)
            }
            if (!verifyPkce(codeVerifier, authCode.codeChallenge)) {
                return tokenResponse(event, {error: "invalid_grant", error_description: "PKCE verification failed"}, 400)
            }
            if (!resourceMatches(resource, authCode.resource)) {
                return tokenResponse(event, {error: "invalid_target", error_description: "resource parameter is required and must match the MCP server"}, 400)
            }
            const codeUser = await users.getById(authCode.userId)
            if (!codeUser?.isPro) {
                await store.revokeUser(authCode.userId)
                return tokenResponse(event, {error: "invalid_grant", error_description: "User is not a PRO member"}, 400)
            }

            // Activate the client before consuming the code, so a failed write can be retried by the client.
            await store.activateClient(auth.client)

            const consumed = await store.consumeAuthCode(code)
            if (!consumed) {
                return tokenResponse(event, {error: "invalid_grant", error_description: "Invalid authorization code"}, 400)
            }

            const tokens = await store.issueTokens({clientId: auth.client.id, userId: consumed.userId, resource: consumed.resource, scope: consumed.scope})
            logger.info("MCP.token", `User ${consumed.userId}`, `Client ${auth.client.id}`, "authorization_code")
            return tokenResponse(event, {access_token: tokens.accessToken, token_type: "Bearer", expires_in: tokens.expiresIn, refresh_token: tokens.refreshToken, scope: consumed.scope})
        }

        if (grantType == "refresh_token") {
            const refreshToken = firstString(body?.refresh_token)
            const resource = firstString(body?.resource)

            if (!resource) {
                return tokenResponse(event, {error: "invalid_target", error_description: "resource parameter is required and must match the MCP server"}, 400)
            }

            const existing = await store.getRefreshToken(refreshToken)
            if (!existing || existing.clientId != auth.client.id) {
                return tokenResponse(event, {error: "invalid_grant", error_description: "Invalid refresh token"}, 400)
            }
            if (!resourceMatches(resource, existing.resource)) {
                return tokenResponse(event, {error: "invalid_target", error_description: "resource parameter is required and must match the MCP server"}, 400)
            }
            const refreshUser = await users.getById(existing.userId)
            if (!refreshUser?.isPro) {
                await store.revokeUser(existing.userId)
                return tokenResponse(event, {error: "invalid_grant", error_description: "User is not a PRO member"}, 400)
            }

            const consumed = await store.consumeRefreshToken(refreshToken)
            if (!consumed) {
                return tokenResponse(event, {error: "invalid_grant", error_description: "Invalid refresh token"}, 400)
            }

            const tokens = await store.issueTokens({clientId: consumed.clientId, userId: consumed.userId, resource: consumed.resource, scope: consumed.scope})
            logger.info("MCP.token", `User ${consumed.userId}`, `Client ${auth.client.id}`, "refresh_token")
            return tokenResponse(event, {access_token: tokens.accessToken, token_type: "Bearer", expires_in: tokens.expiresIn, refresh_token: tokens.refreshToken, scope: consumed.scope})
        }

        return tokenResponse(event, {error: "unsupported_grant_type", error_description: "Only authorization_code and refresh_token are supported"}, 400)
    } catch (ex) {
        logger.error("MCP.token", ex)
        return tokenResponse(event, {error: "server_error", error_description: "Token request failed"}, 500)
    }
}

/**
 * Token revocation (RFC 7009). Always returns 200 per the spec, even on errors.
 */
export const revoke = async (event: RequestEvent): Promise<Response> => {
    try {
        const body = await getBody(event)
        const auth = await authenticateClient(event)
        if (!auth.client) {
            return oauthErrorJson(event, 401, "invalid_client", "Client authentication failed")
        }

        const tokenValue = firstString(body?.token)
        await store.revokeToken(tokenValue)
        return emptyResponse(event, 200)
    } catch (ex) {
        logger.error("MCP.revoke", ex)
        return emptyResponse(event, 200)
    }
}
