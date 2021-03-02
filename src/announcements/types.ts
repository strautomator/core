// Strautomator Core: Announcement types

/**
 * Global announcements (new features, changes etc).
 */
export interface Announcement {
    /** Announcement indexed by ID, prefixed with "ann". */
    id: string
    /** Title of the announcement. */
    title: string
    /** Body of the announcement. */
    body: string
    /** Link associated with the announcement. */
    href?: string
    /** Date when it should start appearing. */
    dateStart: Date
    /** Date when it should expire (end). */
    dateExpiry: Date
    /** How many times it was read (closed by the user). */
    readCount?: number
}
