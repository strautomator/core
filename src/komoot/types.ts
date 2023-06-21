// Strautomator Core: Komoot types

import {Route} from "../routes/types"
import {StravaSport} from "../strava/types"

/**
 * Represents a Komoot route / tour.
 */
export interface KomootRoute extends Route {
    /** Token to extract route details. */
    token?: string
    /** Route difficulty. */
    difficulty?: "easy" | "moderate" | "difficult"
    /** Date when it was cached. */
    dateCached?: Date
    /** Date when it should expire (used for the Firestore TTL). */
    dateExpiry?: Date
}

/**
 * Map from Komoot sport strings to a Strava sport enum.
 */
export const komootSportList = {
    racebike: StravaSport.Ride,
    e_racebike: StravaSport.Ride,
    mtb: StravaSport.MountainBikeRide,
    e_mtb: StravaSport.MountainBikeRide,
    downhillbike: StravaSport.MountainBikeRide,
    mtb_easy: StravaSport.GravelRide,
    e_mtb_easy: StravaSport.GravelRide,
    mtb_advanced: StravaSport.GravelRide,
    e_mtb_advanced: StravaSport.GravelRide,
    touringbicycle: StravaSport.GravelRide,
    e_touringbicycle: StravaSport.GravelRide,
    citybike: StravaSport.GravelRide,
    jogging: StravaSport.Run,
    hike: StravaSport.Hike,
    mountaineering: StravaSport.Hike,
    climbing: StravaSport.Hike
}
