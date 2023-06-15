// Strautomator Core: Routes types

/**
 * Represents a generic route.
 */
export interface Route {
    /** ID of the route. */
    id: string
    /** Name of the route. */
    name?: string
    /** Description of the route. */
    description?: string
    /** Route distance. */
    distance?: number
    /** Starting location as coordinates. */
    locationStart?: [number, number]
    /** Mid point location as coordinates. */
    locationMid?: [number, number]
    /** Starting location as coordinates. */
    locationEnd?: [number, number]
    /** Estimated moving time in seconds. */
    movingTime?: number
    /** Estimated total time with breaks, in seconds. */
    totalTime?: number
    /** Link to the route details. */
    url?: string
}
