// Strautomator Core: Calendar types

/**
 * Cached calendar stored on the database.
 */
export interface CachedCalendar {
    /** Cached calendar ID. */
    id: string
    /** User ID. */
    userId: string
    /** The calendar data (as .ics string). */
    data: string
    /** Date when calendar was last updated. */
    dateUpdated: Date
}

/**
 * Options used to generate activity calendars.
 */
export interface CalendarOptions {
    /** Which activity fields should be added to the events? */
    activityFields?: string[]
    /** Starting date, defaults to the maxCalendarDays on PRO / free accounts. */
    dateFrom?: Date
    /** Exclude commutes? Default is false. */
    excludeCommutes?: boolean
    /** Filter only specific sport types. Default is all. */
    sportTypes?: string[]
}
