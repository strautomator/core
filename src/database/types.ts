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

/**
 * Generic database search query options.
 */
export interface DatabaseSearchOptions {
    /** User ID. */
    userId?: string
    /** Date from. */
    dateFrom?: Date
    /** Date to. */
    dateTo?: Date
    /** Minimum duration. */
    minDuration?: number
    /** Maximum duration. */
    maxDuration?: number
}
