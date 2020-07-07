// Strautomator Core: GearWear types

/**
 * GearWear database state.
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
    /** How many acitivites were counted for this component. */
    activityCount: number
    /** Current mileage of the component. */
    currentMileage: number
    /** Time tracking for the component (in seconds). Zero means disabled. */
    currentTime: number
    /** Alert mileage of the component. */
    alertMileage?: number
    /** Alert time (in seconds) of the components. Zero means disabled. */
    alertTime?: number
    /** Date when an alert was last sent to user. */
    dateAlertSent: Date
    /** Dates and mileages when user has triggered the mileage reset. */
    history: GearWearReset[]
}

/**
 * Date and mileage when user triggered a mileage reset for a particular component.
 */
export interface GearWearReset {
    /** The date of the reset. */
    date: Date
    /** The mileage the component had at the time of the reset. */
    mileage: number
    /** The time (seconds) of use the component had at the time of the reset. */
    time: number
}
