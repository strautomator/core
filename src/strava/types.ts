// Strautomator Core: Strava types

/**
 * An activity on Strava.
 */
export interface StravaActivity {
    /** Activity numeric ID. */
    id: number
    /** Activity type (Ride, Run, etc). */
    type: StravaSport
    /** Activity name. */
    name: string
    /** Activity description or details. */
    description?: string
    /** Marked as coomute? */
    commute?: boolean
    /** Start date and time, local time. */
    dateStart: Date
    /** End date and time, local time. */
    dateEnd: Date
    /** Total distance in meters. */
    distance?: number
    /** Total elevation in meters. */
    elevationGain?: number
    /** Maximum elevation. */
    elevationMax?: number
    /** Total elapsed time in seconds. */
    totalTime: number
    /** Elapsed moving time in secods. */
    movingTime: number
    /** Start location (latitude and longitude). */
    locationStart?: [number, number]
    /** End location (latitude and longitude). */
    locationEnd?: [number, number]
    /** Gear used. */
    gear?: StravaGear
    /** Suffer score. */
    sufferScore?: number
    /** Average speed. */
    speedAvg?: number
    /** Maximum speed. */
    speedMax?: number
    /** Average watts. */
    wattsAvg?: number
    /** Weighted average watts. */
    wattsWeighted?: number
    /** Average cadence. */
    cadenceAvg?: number
    /** Average temperature. */
    temperature?: number
    /** Device name. */
    device?: string
    /** Fields that were updated by Strautomator. */
    updatedFields?: string[]
}

/**
 * Processed activity details to be saved on the database.
 */
export interface StravaProcessedActivity extends StravaActivity {
    /** User details for this activity. */
    user: {
        id: string
        username: string
    }
    /** List of recipe IDs. */
    recipes: string[]
}

/**
 * Helper to transform data from the API to a StravaActivity interface.
 * @param data Input data.
 */
export function toStravaActivity(data): StravaActivity {
    const activity: StravaActivity = {
        id: data.id,
        type: data.type,
        name: data.name,
        description: data.description,
        commute: data.commute,
        dateStart: data.start_date_local,
        dateEnd: data.start_date_local + data.elapsed_time,
        distance: data.distance,
        elevationGain: data.total_elevation_gain,
        elevationMax: data.elev_high,
        totalTime: data.elapsed_time,
        movingTime: data.moving_time,
        locationStart: data.start_latlng,
        locationEnd: data.end_latlng,
        sufferScore: data.suffer_score,
        speedAvg: data.average_speed,
        speedMax: data.max_speed,
        wattsAvg: data.average_watts,
        wattsWeighted: data.weighted_average_watts,
        cadenceAvg: data.average_cadence,
        temperature: data.average_temp,
        device: data.device_name,
        updatedFields: []
    }

    if (data.gear) {
        activity.gear = toStravaGear(data.gear)
    }

    return activity
}

/**
 * A Strava gear (bikes and shoes).
 */
export interface StravaGear {
    /** ID of the gear. */
    id: string
    /** Friendly name set by the user. */
    name: string
    /** Is it the primary gear for the user? */
    primary: boolean
}

/**
 * Helper to transform data from the API to a StravaGear interface.
 * @param data Input data.
 */
export function toStravaGear(data): StravaGear {
    const gear = {
        id: data.id,
        name: data.name || data.description,
        primary: data.primary
    }

    return gear
}

/**
 * Strava athlete details.
 */
export interface StravaProfile {
    /** Athlee ID, the same as the user ID stored on the database. */
    id?: string
    /** Athlete's username. */
    username: string
    /** Athlete's first name. */
    firstName: string
    /** Athlete's last name. */
    lastName: string
    /** Athlete's creation date (on Strava). */
    dateCreated: Date
    /** Athlete's date of last update (on Strava). */
    dateUpdated: Date
    /** Athlete's list of registered bikes. */
    bikes?: StravaGear[]
    /** Athlete's list of registered shoes. */
    shoes?: StravaGear[]
    /** URL to the profile avatar. */
    urlAvatar?: string
}

/**
 * Helper to transform data from the API to a StravaProfile interface.
 * @param data Input data.
 */
export function toStravaProfile(data): StravaProfile {
    const profile: StravaProfile = {
        id: data.id.toString(),
        username: data.username,
        firstName: data.firstname,
        lastName: data.lastname,
        dateCreated: data.created_at,
        dateUpdated: data.updated_at,
        bikes: [],
        shoes: []
    }

    // Has bikes?
    if (data.bikes && data.bikes.length > 0) {
        for (let bike of data.bikes) {
            profile.bikes.push(toStravaGear(bike))
        }
    }

    // Has shoes?
    if (data.shoes && data.shoes.length > 0) {
        for (let shoe of data.shoes) {
            profile.shoes.push(toStravaGear(shoe))
        }
    }

    // Has profile image?
    if (data.profile) {
        profile.urlAvatar = data.profile
    }

    return profile
}

/**
 * OAuth2 access and refresh token for a particular user.
 */
export interface StravaTokens {
    /** The OAuth2 access token. */
    accessToken?: string
    /** The OAuth2 refresh token. */
    refreshToken?: String
    /** Access token expiry date. */
    expiresAt?: number
}

/**
 * Represents a subscription (webhook) for events dispatched by Strava.
 */
export interface StravaWebhook {
    /** Subscription ID. */
    id: number
    /** Callback URL. */
    callbackUrl: string
    /** Last updated. */
    dateUpdated: Date
}

/**
 * Strava sport types.
 */
export enum StravaSport {
    Ride = "Ride",
    Run = "Run"
}
