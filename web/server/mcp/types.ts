// Strautomator MCP types

// OAUTH PERSISTENCE
// --------------------------------------------------------------------------

export interface McpOAuthClient {
    /** Client ID (document ID). */
    id: string
    /** Optional display name. */
    clientName?: string
    /** SHA-256 hash of the client secret, if confidential. */
    clientSecretHash?: string
    /** Token endpoint auth method. */
    tokenEndpointAuthMethod: "none" | "client_secret_post" | "client_secret_basic"
    /** Registered redirect URIs. */
    redirectUris: string[]
    /** Allowed grant types. */
    grantTypes: string[]
    /** Allowed response types. */
    responseTypes: string[]
    /** Date the client was registered. */
    dateIssued: Date
    /** Date the client registration expires. */
    dateExpiry: Date
    /** Date the client was first used to issue tokens. Unused clients expire quickly. */
    dateActivated?: Date
}

export interface McpAuthRequest {
    /** Request ID (document ID). */
    id: string
    /** OAuth client ID. */
    clientId: string
    /** Redirect URI for this authorization. */
    redirectUri: string
    /** Opaque state from the MCP client. */
    state?: string
    /** PKCE code challenge. */
    codeChallenge: string
    /** PKCE method, always S256. */
    codeChallengeMethod: "S256"
    /** Requested resource (MCP canonical URI). */
    resource: string
    /** Requested scope. */
    scope: string
    /** CSRF token for the consent form. */
    consentToken: string
    /** Date this pending request expires. */
    dateExpiry: Date
}

export interface McpAuthCode {
    /** SHA-256 of the authorization code (document ID). */
    id: string
    /** OAuth client ID. */
    clientId: string
    /** Strautomator user ID. */
    userId: string
    /** Redirect URI bound to this code. */
    redirectUri: string
    /** PKCE code challenge. */
    codeChallenge: string
    /** Resource (audience) bound to this code. */
    resource: string
    /** Granted scope. */
    scope: string
    /** Date this code expires. */
    dateExpiry: Date
}

export interface McpToken {
    /** SHA-256 of the token value (document ID). */
    id: string
    /** access or refresh. */
    type: "access" | "refresh"
    /** OAuth client ID. */
    clientId: string
    /** Strautomator user ID. */
    userId: string
    /** Resource (audience) bound to this token. */
    resource: string
    /** Granted scope. */
    scope: string
    /** Hash of the paired refresh token (access tokens only). */
    refreshId?: string
    /** Hash of the paired access token (refresh tokens only). */
    accessId?: string
    /** Date this token expires. */
    dateExpiry: Date
}

// MCP PROTOCOL
// --------------------------------------------------------------------------

export interface McpToolResult {
    content: {type: "text"; text: string}[]
    isError?: boolean
}

export interface JsonRpcRequest {
    jsonrpc: "2.0"
    id?: string | number | null
    method: string
    params?: any
}

export interface JsonRpcResponse {
    jsonrpc: "2.0"
    id: string | number | null
    result?: any
    error?: {code: number; message: string; data?: any}
}
