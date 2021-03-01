// Strautomator Core: Notification types

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
}

/**
 * Base notification data from Strautomator to a user.
 */
export interface BaseNotification {
    /** Notification indexed by ID. */
    id: string
    /** User ID. */
    userId: string
    /** Title of the notification. */
    title: string
    /** Body of the notification. */
    body: string
    /** Link associated with the notification. */
    href?: string
    /** Was the notification read? */
    read: boolean
    /** Date notification was created. */
    dateCreated: Date
    /** Date notification was read by the user. */
    dateRead?: Date
    /** Expiry date (notification won't show after that date). */
    dateExpiry?: Date
}

/**
 * Notification of a failed automation recipe.
 */
export interface FailedRecipeNotification extends BaseNotification {
    /** Reference recipe ID. */
    recipeId: string
    /** Strava activity ID. */
    activityId: number
}

/**
 * Notification related to a GearWear configuration.
 */
export interface GearWearNotification extends BaseNotification {
    /** Reference GearWear ID. */
    gearwearId: string
}
