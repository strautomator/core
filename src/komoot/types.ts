// Strautomator Core: Komoot types

/**
 * Represents a Komoot route / tour.
 */
export interface KomootRoute {
    /** ID of the route. */
    id: string
    /** Total distance. */
    distance?: number
    /** Expected duration. */
    estimatedTime?: number
    /** Date when it was cached. */
    dateCached?: Date
    /** Date when it should expire (used for the Firestore TTL). */
    dateExpiry?: Date
}
