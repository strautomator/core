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
    /** Gear name (taken directly from the Strava gear). */
    name?: string
    /** User owner of the configuration. */
    userId: string
    /** Tracking information. */
    components: GearWearComponent[]
    /** Flag to set if gear is having its distance updated right now. */
    updating?: boolean
    /** Is the gearwear configuration disabled? */
    disabled?: boolean
    /** Details about the last update made to this GearWear. */
    lastUpdate?: {
        /** Date of last update. */
        date: Date
        /** IDs of the activities. */
        activities: number[]
        /** Total distance added. */
        distance: number
        /** Total time (in seconds) added. */
        time: number
    }
}

/**
 * Gear / components wear component tracking details..
 */
export interface GearWearComponent {
    /** Name of the component being tracked. */
    name: string
    /** How many activities were counted for this component. */
    activityCount: number
    /** Current distance of the component. */
    currentDistance: number
    /** Time tracking for the component (in seconds). Zero means disabled. */
    currentTime: number
    /** Alert distance of the component. */
    alertDistance?: number
    /** Alert time (in seconds) of the components. Zero means disabled. */
    alertTime?: number
    /** Alert when it reaches a specific percentage of the target mileage / hours. */
    preAlertPercent?: number
    /** Date when a pre alert was last sent to the user. */
    datePreAlertSent?: Date
    /** Date when an alert was last sent to user. */
    dateAlertSent?: Date
    /** Dates and distances when user has triggered the distance reset. */
    history: GearWearReset[]
    /** Is the component currently disabled? */
    disabled?: boolean
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
