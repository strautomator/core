// Strautomator Core: Calendar types

/**
 * Cached calendar stored on the database.
 */
export interface CachedCalendar {
    /** Cached calendar ID. */
    id: string
    /** The calendar data (as .ics string). */
    data: string
    /** Date when calendar was last updated. */
    dateUpdated: Date
}

/**
 * Options used to generate activity calendars.
 */
export interface CalendarOptions {
    /** Startind date, defaults to 1 year. */
    dateFrom?: Date
    /** Exclude commutes? Default is false. */
    excludeCommutes?: boolean
    /** Filter only specific sport types. Default is all. */
    sportTypes?: string[]
}
