// Strautomator Core: Garmin types

/**
 * Garmin linked profile details.
 */
export interface GarminProfile {
    /** Garmin user ID. */
    id: string
    /** Garmin tokens. */
    tokens: GarminTokens
}

/**
 * Garmin authentication tokens.
 */
export interface GarminTokens {
    /** Access token. */
    accessToken: string
    /** Refresh token (OAuth2 only). */
    refreshToken?: string
    /** Access token expiry timestamp. */
    expiresAt?: number
    /** Refresh token expiry timestamp. */
    refreshExpiresAt?: number
    /** Access token secret (legacy OAuth1 only). */
    tokenSecret?: string
    /** Token repeated failure count. */
    failureCount?: number
}

/**
 * Webhooks dispatched by Garmin.
 */
export interface GarminWebhookData {
    /** Activity files data. */
    activityFiles?: GarminPingActivityFile[]
    /** Deregistrations data. */
    deregistrations?: GarminPing[]
    /** User permissions change data. */
    userPermissionsChange?: GarminPingPermissions[]
}

/**
 * Base ping data from Garmin.
 */
export interface GarminPing {
    /** User ID (from Garmin). */
    userId?: string
    /** User access token (Legacy OAuth1 only). */
    userAccessToken?: string
}

/**
 * Activity details from Garmin. Mostly the same schema as the ping
 * from Garmin, expect the appended dateStart and devices.
 */
export interface GarminPingActivityFile extends GarminPing {
    /** Activity unique ID. */
    activityId?: string
    /** Activity name on Garmin. */
    activityName?: string
    /** Callback URL to download the file. */
    callbackURL?: string
    /** File type. */
    fileType?: string
    /** Activity timestamp. */
    startTimeInSeconds?: number
}

/**
 * An user permissions change ping from Garmin.
 */
export interface GarminPingPermissions extends GarminPing {
    /** List of updated permissions. */
    permissions?: string[]
}

/**
 * OAuth1 metadata, only used to sign the OAuth1 to OAuth2 token exchange.
 */
export interface OAuth1Data {
    oauth_timestamp: number
    oauth_nonce: string
    oauth_consumer_key: string
    oauth_version: string
    oauth_verifier?: string
    oauth_token?: string
    oauth_body_hash?: string
    oauth_signature?: string
    oauth_signature_method?: string
}

/**
 * OAuth2 token response from Garmin, also returned by the OAuth1 to OAuth2 token exchange.
 */
export interface OAuth2Token {
    access_token: string
    refresh_token?: string
    token_type?: string
    expires_in?: number
    refresh_token_expires_in?: number
    scope?: string
    jti?: string
}
