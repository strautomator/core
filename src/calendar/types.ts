// Strautomator Core: Calendar types

/**
 * Calendar details saved to the database.
 */
export interface CalendarData {
    /** The cached calendar ID. */
    id: string
    /** The user ID. */
    userId: string
    /** Calendar options used to generate the calendar. */
    options: CalendarOptions
    /** How many activities the calendar has. */
    activityCount?: number
    /** How many club events the calendar has.  */
    clubEventCount?: number
    /** Flag to set if the calendar is considered expired and should be updated. */
    pendingUpdate?: boolean
    /** Date when the calendar cache was last accessed. */
    dateAccess?: Date
    /** Date when the cache was last updated. */
    dateUpdated?: Date
}

/**
 * Options used to generate activity calendars.
 */
export interface CalendarOptions {
    /** Include past activities? */
    activities?: boolean
    /** Include club events? */
    clubs?: boolean
    /** Include only specific clubs (by ID), mandatory for free accounts. */
    clubIds?: string[]
    /** Exclude commutes? Default is false. */
    excludeCommutes?: boolean
    /** Exclude club events which user hasn't joined to? */
    excludeNotJoined?: boolean
    /** Include club events from other countries? */
    includeAllCountries?: boolean
    /** Add a link to the target activity / club event in the description? */
    linkInDescription?: boolean
    /** Compact details? */
    compact?: boolean
    /** Enforce a lower TTL for cached calendars. */
    fresher?: boolean
    /** Filter only specific sport types. Default is all. */
    sportTypes?: string[]
    /** Past days, defaults to the pastCalendarDays setting. */
    daysFrom?: number
    /** Future days, defaults to the futureCalendarDays setting. */
    daysTo?: number
}

/**
 * Cached calendar event title and dates, indexed by event ID.
 */
export interface CalendarCachedEvents {
    [eventId: string]: {
        title: string
        dateStart: Date
        dateEnd: Date
    }
}
