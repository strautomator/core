// Strautomator Core: Database types

/**
 * Custom database options.
 */
export interface DatabaseOptions {
    /** Database instance / connection description. */
    description?: string
    /** Cache duration in seconds. */
    cacheDuration?: number
    /** Collection suffix. */
    collectionSuffix?: string
    /** Ignore undefined properties? */
    ignoreUndefinedProperties?: boolean
}
