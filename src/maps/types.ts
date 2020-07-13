// Strautomator Core: Maps types

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
