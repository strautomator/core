// Strautomator Core: Strava types

import moment = require("moment")

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
    dateEnd?: Date
    /** Total distance in kilometers. */
    distance?: number
    /** Total elevation gain in meters. */
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
    /** Average speed. */
    speedAvg?: number
    /** Maximum speed. */
    speedMax?: number
    /** Average watts. */
    wattsAvg?: number
    /** Weighted average watts. */
    wattsWeighted?: number
    /** Average heart rate. */
    hrAvg?: number
    /** Maximum heart rate. */
    hrMax?: number
    /** Average cadence. */
    cadenceAvg?: number
    /** Calories. */
    calories?: number
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
export interface StravaProcessedActivity {
    /** Activity ID. */
    id: number
    /** Activity type (Ride, Run, etc). */
    type: StravaSport
    /** Start date of the activity. */
    dateStart: Date
    /** Processing date. */
    dateProcessed: Date
    /** User details for this activity. */
    user: {
        /** User ID. */
        id: string
        /** User display name. */
        displayName: string
    }
    /** List of recipes applied to the activity. */
    recipes: {
        [id: string]: {
            /** Title of the recipe. */
            title: string
            /** Conditions of the recipe (summary text)/ */
            conditions: string[]
            /** Actions of the recipe (summary text)/ */
            actions: string[]
        }
    }
    /** List of fields updated on the activity. */
    updatedFields: {
        [id: string]: any
    }
}

/**
 * Helper to transform data from the API to a StravaActivity interface.
 * @param data Input data.
 */
export function toStravaActivity(data, units: string): StravaActivity {
    const activity: StravaActivity = {
        id: data.id,
        type: data.type,
        name: data.name,
        description: data.description,
        commute: data.commute,
        dateStart: new Date(data.start_date_local),
        elevationGain: data.total_elevation_gain,
        elevationMax: data.elev_high,
        totalTime: data.elapsed_time,
        movingTime: data.moving_time,
        locationStart: data.start_latlng,
        locationEnd: data.end_latlng,
        wattsAvg: data.average_watts,
        wattsWeighted: data.weighted_average_watts,
        hrAvg: data.average_heartrate,
        hrMax: data.max_heartrate,
        cadenceAvg: data.average_cadence,
        calories: data.calories,
        temperature: data.average_temp,
        device: data.device_name,
        updatedFields: []
    }

    // Set end date.
    if (data.elapsed_time) {
        activity.dateEnd = moment(activity.dateStart).add(data.elapsed_time, "s").toDate()
    }

    // Set activity gear.
    if (data.gear) {
        activity.gear = toStravaGear(data.gear)
    }

    // Convert values according to the specified units.
    if (units == "imperial") {
        const feet = 3.28084
        const miles = 0.621371

        if (data.total_elevation_gain) {
            activity.elevationGain = Math.round(data.total_elevation_gain * feet)
        }
        if (data.elev_high) {
            activity.elevationMax = Math.round(data.elev_high * feet)
        }
        if (data.distance) {
            activity.distance = parseFloat(((data.distance / 1000) * miles).toFixed(1))
        }
        if (data.average_speed) {
            activity.speedAvg = parseFloat((data.average_speed * 3.6 * miles).toFixed(1))
        }
        if (data.max_speed) {
            activity.speedMax = parseFloat((data.max_speed * 3.6 * miles).toFixed(1))
        }
    } else {
        if (data.distance) {
            activity.distance = parseFloat((data.distance / 1000).toFixed(1))
        }
        if (data.average_speed) {
            activity.speedAvg = parseFloat((data.average_speed * 3.6).toFixed(1))
        }
        if (data.max_speed) {
            activity.speedMax = parseFloat((data.max_speed * 3.6).toFixed(1))
        }
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
    /** Measurement preference. */
    units?: "metric" | "imperial"
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
        units: data.measurement_preference == "feet" ? "imperial" : "metric",
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

        // Relative avatar URL? Append Strava's base URL.
        if (profile.urlAvatar.indexOf("://") < 0) {
            profile.urlAvatar = `/images/avatar.png`
        }
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
    refreshToken?: string
    /** Access token expiry date. */
    expiresAt?: number
}

/**
 * Represents a webhook (subscription) for events dispatched by Strava.
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
