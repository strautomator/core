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
    /** Track title (combination of artits + track name). */
    title: string
    /** Track duration string. */
    duration: string
    /** Played date. */
    datePlayed?: Date
}
