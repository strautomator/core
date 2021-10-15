// Strautomator Core: Calendar types

/**
 * Cached calendar stored on the database.
 */
export interface CachedCalendar {
    /** Cached calendar ID. */
    id: string
    /** User ID. */
    userId: string
    /** Date when calendar was last updated. */
    dateUpdated: Date
    /** The calendar data (as .ics string). */
    data?: string
    /** If calendar is too long, data is stored as shards instead. */
    shards?: any[]
}

/**
 * Options used to generate activity calendars.
 */
export interface CalendarOptions {
    /** Include past activities? */
    activities?: boolean
    /** Include club events? */
    clubs?: boolean
    /** Starting date, defaults to the pastCalendarDays on PRO / free accounts. */
    dateFrom?: Date
    /** Ending date, defaults to futureCalendarDays on PRO / free accounts. */
    dateTo?: Date
    /** Exclude commutes? Default is false. */
    excludeCommutes?: boolean
    /** Filter only specific sport types. Default is all. */
    sportTypes?: string[]
}
