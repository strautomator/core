// Strautomator Core: Maps types

/**
 * Detailed address with neighborhood, city, state and country.
 */
export interface MapAddress {
    /** Neighborhood. */
    neighborhood?: string
    /** City name. */
    city?: string
    /** State name. */
    state?: string
    /** Country name. */
    country?: string
    /** Timestamp when that address was last resolved. */
    dateCached?: Date
    /** Expiry date (used as TTL in Firestore). */
    dateExpiry?: Date
}

/**
 * Latitude and longitude for a specific address.
 */
export interface MapCoordinates {
    /** Full address details. */
    address?: string
    /** Latitude as number */
    latitude: number
    /** Longitude as number. */
    longitude: number
    /** Place ID on the geocoding provider. */
    placeId?: string
    /** Timestamp when these coordinates were last resolved. */
    dateCached?: Date
    /** Expiry date (used as TTL in Firestore). */
    dateExpiry?: Date
}
