// Strautomator Core: GearWear types

/**
 * GearWeat database state.
 */
export interface GearWearDbState {
    /** How many activities were processed on the last execution of processRecentActivities(). */
    recentActivityCount?: number
    /** How many users had activities processed on the last execution of processRecentActivities(). */
    recentUserCount?: number
    /** Date of the last execution of processRecentActivities(). */
    dateLastProcessed?: Date
    /** Is the processRecentActivities() executing right now?  */
    processing?: boolean
}

/**
 * Gear / components wear configuration details.
 */
export interface GearWearConfig {
    /** User's gear ID (same as Strava's gear). */
    id: string
    /** User owner of the configuration. */
    userId: string
    /** Tracking information. */
    components: GearWearComponent[]
    /** Flag to set if gear is having its mileage updated right now. */
    updating?: boolean
}

/**
 * Gear / components wear component tracking details..
 */
export interface GearWearComponent {
    /** Name of the component being tracked. */
    name: string
    /** Current mileage of the component. */
    currentMileage: number
    /** Alert mileage of the component. */
    alertMileage: number
    /** Date when an alert was last sent to user. */
    dateAlertSent: Date
    /** Dates when user has triggered the mileage reset. */
    resetDates: Date[]
}
