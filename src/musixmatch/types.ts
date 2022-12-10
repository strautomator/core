// Strautomator Core: musixmatch types

/**
 * Represents a cached musixmatch lyrics.
 */
export interface MusixmatchLyrics {
    /** ID of the Spotify track. */
    id: string
    /** Lyrics. */
    lyrics: string
    /** Date when it should expire (used for the Firestore TTL). */
    dateExpiry?: Date
}
