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
    /** Access token secret. */
    tokenSecret: string
    /** Token repeated failure count. */
    failureCount?: number
}

/**
 * An activity from Garmin.
 */
export interface GarminActivity {
    /** Activity unique ID. */
    id?: string
}

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

export interface OAuth1Token {
    oauth_token: string
    oauth_token_secret: string
}
