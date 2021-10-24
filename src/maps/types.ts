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
    /** Place ID on Google Maps. */
    placeId?: string
}
