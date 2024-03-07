// Strautomator Core: Calendar types

import dayjs from "dayjs"

/**
 * Options used to generate activity calendars.
 */
export interface CalendarOptions {
    /** Include past activities? */
    activities?: boolean
    /** Include club events? */
    clubs?: boolean
    /** Include only specific clubs (by ID). */
    clubIds?: string[]
    /** Starting date (as DayJS), defaults to the pastCalendarDays setting. */
    dateFrom?: dayjs.Dayjs
    /** Ending date (as DayJS), defaults to the futureCalendarDays setting. */
    dateTo?: dayjs.Dayjs
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
}
