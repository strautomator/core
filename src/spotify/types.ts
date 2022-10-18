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
 * Represents an artist on Spotify
 */
export interface SpotifyArtist {
    /** ID of the artist. */
    id: string
    /** Artist name. */
    name: string
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
    artists: SpotifyArtist[]
}
