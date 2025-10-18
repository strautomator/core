// Strautomator Core: Calendar types

import {ICalEventData} from "ical-generator"

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
    /** How many events were added using cached data? */
    cacheCount?: number
    /** How many activities the calendar has. */
    activityCount?: number
    /** How many club events the calendar has.  */
    clubEventCount?: number
    /** How many GearWear component changes the calendar has. */
    gearEventCount?: number
    /** How many requests were triggered on the last calendar build task. */
    lastRequestCount?: number
    /** Flag to set if the calendar is considered expired and should be updated. */
    pendingUpdate?: boolean
    /** Date when the calendar cache was last accessed. */
    dateAccess?: Date
    /** Date when the cache was last updated. */
    dateUpdated?: Date
    /** Date when the calendar should be automatically expired. */
    dateExpiry?: Date
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
    /** Include GearWear notifications and changes? */
    gear?: boolean
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
 * Generated calendar output with the ICS and serialized events.
 */
export interface CalendarOutput {
    /** ICS output string. */
    ics: string
    /** Serialized calendar events (as JSON string). */
    events?: string
}

/**
 * Generated calendar output with the ICS and serialized events.
 */
export interface CalendarCachedEvents {
    [id: string]: ICalEventData
}
