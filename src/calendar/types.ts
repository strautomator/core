// Strautomator Core: Calendar types

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
    /** Exclude club events which user hasn't joined to? */
    excludeNotJoined?: boolean
    /** Include club events from other countries? */
    includeAllCountries?: boolean
    /** Filter only specific sport types. Default is all. */
    sportTypes?: string[]
}
