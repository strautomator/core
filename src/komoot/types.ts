// Strautomator Core: Komoot types

import {Route} from "../routes/types"

/**
 * Represents a Komoot route / tour.
 */
export interface KomootRoute extends Route {
    /** Date when it was cached. */
    dateCached?: Date
    /** Date when it should expire (used for the Firestore TTL). */
    dateExpiry?: Date
}
