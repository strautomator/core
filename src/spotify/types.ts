// Strautomator Core: Spotify types

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

/**
 * Represents a track / music on Spotify
 */
export interface SpotifyTrack {
    /** ID of the track. */
    id: string
    /** Track name. */
    name: string
    /** Track artists. */
    artists: string[]
    /** Track title (combination of artist + track name). */
    title: string
    /** Track duration string. */
    duration: string
    /** Played date. */
    datePlayed?: Date
}

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
