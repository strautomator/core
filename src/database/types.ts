// Strautomator Core: Database types

/**
 * Custom database options.
 */
export interface DatabaseOptions {
    /** Database instance / connection description. */
    description?: string
    /** Collection suffix. */
    collectionSuffix?: string
    /** Ignore undefined properties? */
    ignoreUndefinedProperties?: boolean
}

/**
 * Helpers passed to {@link Database.runTransaction} for atomic reads and writes.
 */
export interface DatabaseTransaction {
    /** Read a document inside the transaction. */
    get: (collection: string, id: string) => Promise<any>
    /** Delete a document inside the transaction. */
    delete: (collection: string, id: string) => void
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
