// Strautomator Core: GearWear types

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
    /** Was the alert recently sent to the user? */
    alertSent: 0 | 1 | 2
    /** Dates when user has triggered the mileage reset. */
    resetDates: Date[]
}
