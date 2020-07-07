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
    /** Flag to set if gear is having its distance updated right now. */
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
    /** Current distance of the component. */
    currentDistance: number
    /** Time tracking for the component (in seconds). Zero means disabled. */
    currentTime: number
    /** Alert distance of the component. */
    alertDistance?: number
    /** Alert time (in seconds) of the components. Zero means disabled. */
    alertTime?: number
    /** Date when an alert was last sent to user. */
    dateAlertSent: Date
    /** Dates and distances when user has triggered the distance reset. */
    history: GearWearReset[]
}

/**
 * Date and distance when user triggered a distance reset for a particular component.
 */
export interface GearWearReset {
    /** The date of the reset. */
    date: Date
    /** The distance the component had at the time of the reset. */
    distance: number
    /** The time (seconds) of use the component had at the time of the reset. */
    time: number
}
