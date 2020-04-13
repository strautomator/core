/// <reference types="node" />
/**
 * Google Maps wrapper.
 */
export declare class Maps {
    private constructor();
    private static _instance;
    static get Instance(): Maps;
    /**
     * Google Maps client.
     */
    private client;
    /**
     * Init the database wrapper.
     */
    init: () => Promise<void>;
    /**
     * Get the geocode data for the specified address.
     * @param address Address to query the coordinates for.
     * @param region Optional TLD biasing region.
     */
    getGetcode: (address: string, region?: string) => Promise<Coordinates[]>;
    /**
     * Download a static PNG image representing a map for the specified coordinates.
     * @param coordinates The coordinates to get an image for.
     */
    getStaticImage: (coordinates: Coordinates, options?: any) => Promise<Buffer>;
    /**
     * Return a path string representing a circle to be draw on a static map image.
     * @param coordinates The center coordinates.
     * @param radius The circle radius.
     */
    private getCircleString;
}
/**
 * Latitude and longitude for a specific address.
 */
export interface Coordinates {
    /** Full address details. */
    address?: string;
    /** Latitude as number */
    latitude: number;
    /** Longitude as number. */
    longitude: number;
    /** Place ID on Google Maps. */
    placeId?: string;
}
declare const _default: Maps;
export default _default;
