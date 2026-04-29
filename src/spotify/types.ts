// Strautomator Core: Spotify types

/**
 * Spotify API request options.
 */
export interface SpotifyRequestOptions {
    /** Body to be posted to the API. */
    data?: any
    /** Request method. */
    method?: "GET" | "POST"
    /** Additional request headers. */
    headers?: any
    /** Path to be appended to the base API URL. */
    path?: string
    /** Target request URL including https://. */
    url?: string
    /** Custom timeout, in milliseconds. */
    timeout?: number
    /** Spotify tokens used to generate the Bearer auth header. */
    tokens?: SpotifyTokens
}

/**
 * Spotify linked profile details.
 */
export interface SpotifyProfile {
    /** Spotify user ID. */
    id: string
    /** User email. */
    email: string
    /** Spotify tokens. */
    tokens: SpotifyTokens
}

/**
 * Spotify authentication tokens.
 */
export interface SpotifyTokens {
    /** Access token. */
    accessToken: string
    /** Refresh token. */
    refreshToken?: string
    /** Access token expiry timestamp (in seconds). */
    expiresAt: number
    /** Token repeated failure count. */
    failureCount?: number
}
