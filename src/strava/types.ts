// Strautomator Core: Strava types

import _ = require("lodash")
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
    dateStart?: Date
    /** End date and time, local time. */
    dateEnd?: Date
    /** Stores the original UTC offset (timezone) in minutes. */
    utcStartOffset?: number
    /** Total distance in kilometers. */
    distance?: number
    /** Total elevation gain in meters. */
    elevationGain?: number
    /** Maximum elevation. */
    elevationMax?: number
    /** Distance / climbing ratio: 19m per kilometer or 100ft per mile */
    climbingRatio?: number
    /** Total elapsed time in seconds. */
    totalTime: number
    /** Elapsed moving time in seconds. */
    movingTime: number
    /** Start location (latitude and longitude). */
    locationStart?: [number, number]
    /** End location (latitude and longitude). */
    locationEnd?: [number, number]
    /** Map encoded as polyline. */
    polyline?: string
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
    /** Max watts. */
    wattsMax?: number
    /** Watts comes from a power meter? */
    hasPower?: boolean
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
    /** Was the activity created manually? */
    manual?: boolean
    /** Activity icon (emoticon). */
    icon?: string
    /** Fields that were updated by Strautomator (internal use only). */
    updatedFields?: string[]
    /** Was a link to Strautomator added to the activity (internal use only)? */
    linkback?: boolean
}

/**
 * Helper to transform data from the API to a StravaActivity interface.
 * @param data Input data.
 */
export function toStravaActivity(data, profile: StravaProfile): StravaActivity {
    const startDate = moment.utc(data.start_date)

    const activity: StravaActivity = {
        id: data.id,
        type: data.type,
        name: data.name,
        description: data.description,
        commute: data.commute,
        dateStart: startDate.toDate(),
        utcStartOffset: data.utc_offset,
        elevationGain: data.total_elevation_gain,
        elevationMax: data.elev_high,
        totalTime: data.elapsed_time,
        movingTime: data.moving_time,
        locationStart: data.start_latlng,
        locationEnd: data.end_latlng,
        hasPower: data.device_watts,
        wattsAvg: data.average_watts ? Math.round(data.average_watts) : null,
        wattsWeighted: data.weighted_average_watts ? Math.round(data.weighted_average_watts) : null,
        wattsMax: data.max_watts ? Math.round(data.max_watts) : null,
        hrAvg: data.average_heartrate ? Math.round(data.average_heartrate) : null,
        hrMax: data.max_heartrate ? Math.round(data.max_heartrate) : null,
        cadenceAvg: data.average_cadence,
        calories: data.calories,
        temperature: data.average_temp,
        device: data.device_name,
        manual: data.manual,
        updatedFields: []
    }

    // Strava returns offset in seconds, but we store in minutes.
    if (activity.utcStartOffset) {
        activity.utcStartOffset = activity.utcStartOffset / 60
    }

    // Set end date.
    if (data.elapsed_time) {
        activity.dateEnd = startDate.add(data.elapsed_time, "s").toDate()
    }

    // Set activity gear.
    const gearId = data.gear && data.gear.id ? data.gear.id : data.gear_id
    if (gearId) {
        activity.gear = activity.gear = _.find(profile.bikes, {id: gearId}) || _.find(profile.shoes, {id: gearId})
    } else if (data.gear) {
        activity.gear = toStravaGear(data.gear.id, profile)
    }

    // Set polyline.
    if (data.map) {
        activity.polyline = data.map.polyline
    }

    // Default climbing ratio multiplier in metric is 19m / 1km.
    let cRatioMultiplier = 19

    // Convert values according to the specified units.
    if (profile.units == "imperial") {
        const feet = 3.28084
        const miles = 0.621371

        // Imperial climbing ration multiplier is 100ft / 1mi
        cRatioMultiplier = 100

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

    // Calculate climbing ratio with 2 decimal places.
    if (activity.distance && activity.elevationGain) {
        const climbingRatio = activity.elevationGain / (activity.distance * cRatioMultiplier)
        activity.climbingRatio = Math.round(climbingRatio * 100) / 100
    }

    // Get activity emoticon.
    activity.icon = getActivityIcon(activity)

    return activity
}

/**
 * Return activity icon (emoji) based on its type.
 * @param activity The relevant Strava activity.
 */
export function getActivityIcon(activity: StravaActivity): string {
    switch (activity.type) {
        case "Run":
        case "VirtualRun":
            return "🏃"
        case "Walk":
            return "🚶"
        case "Ride":
        case "EBikeRide":
        case "VirtualRide":
            return "🚲"
        case "Swim":
            return "🏊"
        case "AlpineSki":
        case "BackcountrySki":
        case "NordicSki":
            return "⛷"
        case "Snowboard":
            return "🏂"
        case "IceSkate":
        case "Snowshoe":
            return "⛸"
        case "Skateboard":
            return "🛹"
        case "RockClimbing":
            return "🧗"
        case "Surfing":
        case "Windsurf":
            return "🏄"
        case "Canoeing":
            return "🛶"
        case "Rowing":
            return "🚣"
        case "Sail":
            return "⛵"
        case "Golf":
            return "🏌"
        case "Soccer":
            return "⚽"
        case "Crossfit":
        case "Elliptical":
        case "WeightTraining":
            return "🏋"
        case "Yoga":
            return "🧘"
        case "Wheelchair":
            return "🧑‍🦽"
        default:
            return "👤"
    }
}

/**
 * Processed activity details to be saved on the database.
 */
export interface StravaProcessedActivity {
    /** Activity ID. */
    id: number
    /** Activity type (Ride, Run, etc). */
    type: StravaSport
    /** Name of the saved activity. */
    name: string
    /** Start date of the activity. */
    dateStart: Date
    /** Original UTC offset (timezone) of the activity. */
    utcStartOffset: number
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
    /** Was a link to Strautomator added to the activity? */
    linkback?: boolean
    /** If failed, this will contain the error description. */
    error?: string
}

/**
 * A Strava gear (bikes and shoes).
 */
export interface StravaGear {
    /** ID of the gear. */
    id: string
    /** Friendly name set by the user. */
    name: string
    /** Brand of the gear. */
    brand?: string
    /** Model of the gear. */
    model?: string
    /** Is it the primary gear for the user? */
    primary: boolean
    /** Total distance (taken from Strava, respecting the user's units). */
    distance: number
}

/**
 * Helper to transform data from the API to a StravaGear interface.
 * @param data Input data.
 */
export function toStravaGear(data, profile: StravaProfile): StravaGear {
    const gear: StravaGear = {
        id: data.id,
        name: data.name || data.description,
        primary: data.primary,
        distance: data.distance / 1000
    }

    // Has brand and model?
    if (data.brand_name) {
        gear.brand = data.brand_name
    }
    if (data.model_name) {
        gear.model = data.model_name
    }

    // User using imperial units? Convert to miles.
    if (profile.units == "imperial" && gear.distance > 0) {
        const miles = 0.621371
        gear.distance = gear.distance * miles
    }

    // Round distance.
    gear.distance = Math.round(gear.distance)

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
    /** Athlete's city. */
    city?: string
    /** Athlete's country. */
    country?: string
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
        city: data.city || null,
        country: data.country || null,
        dateCreated: moment.utc(data.created_at).toDate(),
        dateUpdated: moment.utc(data.updated_at).toDate(),
        units: data.measurement_preference == "feet" ? "imperial" : "metric",
        bikes: [],
        shoes: []
    }

    // Has bikes?
    if (data.bikes && data.bikes.length > 0) {
        for (let bike of data.bikes) {
            profile.bikes.push(toStravaGear(bike, profile))
        }
    }

    // Has shoes?
    if (data.shoes && data.shoes.length > 0) {
        for (let shoes of data.shoes) {
            profile.shoes.push(toStravaGear(shoes, profile))
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
    /** Keep also the last valid access token saved. */
    previousAccessToken?: string
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
    EBikeRide = "EBikeRide",
    VirtualRide = "VirtualRide",
    Run = "Run",
    VirtualRun = "VirtualRun",
    Walk = "Walk",
    Swim = "Swim",
    AlpineSki = "AlpineSki",
    BackcountrySki = "BackcountrySki",
    Canoeing = "Canoeing",
    Crossfit = "Crossfit",
    Elliptical = "Elliptical",
    Golf = "Golf",
    Handcycle = "Handcycle",
    Hike = "Hike",
    IceSkate = "IceSkate",
    InlineSkate = "InlineSkate",
    Kayaking = "Kayaking",
    Kitesurf = "Kitesurf",
    NordicSki = "NordicSki",
    RockClimbing = "RockClimbing",
    RollerSki = "RollerSki",
    Rowing = "Rowing",
    Sail = "Sail",
    Skateboard = "Skateboard",
    Snowboard = "Snowboard",
    Snowshoe = "Snowshoe",
    Soccer = "Soccer",
    StairStepper = "StairStepper",
    StandUpPaddling = "StandUpPaddling",
    Surfing = "Surfing",
    Velomobile = "Velomobile",
    WeightTraining = "WeightTraining",
    Wheelchair = "Wheelchair",
    Windsurf = "Windsurf",
    Workout = "Workout",
    Yoga = "Yoga"
}
