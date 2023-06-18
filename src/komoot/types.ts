// Strautomator Core: Komoot types

import {Route} from "../routes/types"

/**
 * Represents a Komoot route / tour.
 */
export interface KomootRoute extends Route {
    /** Token to extract route details. */
    token?: string
    /** Date when it was cached. */
    dateCached?: Date
    /** Date when it should expire (used for the Firestore TTL). */
    dateExpiry?: Date
}
