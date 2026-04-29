// Strautomator Core: Music types

/**
 * Represents a generic music track (Spotify, Last.fm, etc).
 */
export interface MusicTrack {
    /** ID of the track. */
    id: string
    /** Track name. */
    name: string
    /** Track artists. */
    artist: string
    /** Track title (combination of artist + track name). */
    title: string
    /** Track duration string. */
    duration?: string
    /** Played date. */
    datePlayed?: Date
}

/**
 * Represents cached version of track lyrics.
 */
export interface TrackLyrics {
    /** ID of the track. */
    id: string
    /** Lyrics. */
    lyrics: string
    /** Date when it should expire (used for the Firestore TTL). */
    dateExpiry?: Date
}
