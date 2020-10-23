// Strautomator Core: Calendar types

/**
 * Options used to generate activity calendars.
 */
export interface CalendarOptions {
    /** Startind date, defaults to 1 year. */
    dateFrom?: Date
    /** Filter only specific sport types. Default is all. */
    sportTypes?: string[]
    /** Exclude commutes? Default is false. */
    excludeCommutes?: boolean
}
