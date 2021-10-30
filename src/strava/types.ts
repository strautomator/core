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
    /** Private note (visible to the owner only). */
    privateNote?: string
    /** Marked as coomute? */
    commute?: boolean
    /** Activity hidden on the home feed? */
    hideHome?: boolean
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
    /** The activity has location coordinates? */
    hasLocation?: boolean
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
    /** Relative effort (previously called suffer score). */
    relativeEffort?: number
    /** Perceived exertion, where 1 is easy and 10 is max effort.  */
    perceivedExertion?: number
    /** Average temperature. */
    temperature?: number
    /** Device name. */
    device?: string
    /** Was the activity created manually? */
    manual?: boolean
    /** Has photos? */
    hasPhotos?: boolean
    /** Activity map style. */
    mapStyle?: StravaMapStyle
    /** Activity icon (emoticon). */
    icon?: string
    /** Fields that were updated by Strautomator (internal use only). */
    updatedFields?: string[]
    /** Was a link to Strautomator added to the activity (internal use only)? */
    linkback?: boolean
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
    /** Is the activity queued to be processed? */
    queued?: boolean
    /** Queued date. */
    dateQueued?: Date
    /** Processing date. */
    dateProcessed?: Date
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
    /** User's cycling FTP. */
    ftp?: number
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
 * A Strava club.
 */
export interface StravaClub {
    /** The club ID. */
    id: string
    /** Club name. */
    name: string
    /** Sport type. */
    sport: "cycling" | "running" | "triathlon" | "other"
    /** Club target URL. */
    url: string
    /** Club type. */
    type?: string
    /** Cover photo. */
    photo?: string
    /** Club location city. */
    city?: string
    /** Club location country. */
    country?: string
    /** How many members. */
    memberCount?: number
    /** Is the club private? */
    private?: boolean
}

/**
 * A scheduled Strava event.
 */
export interface StravaClubEvent {
    /** The club ID. */
    id: string
    /** Event title. */
    title: string
    /** Event description. */
    description: string
    /** Which sport is it? */
    type: StravaSport
    /** Event dates. */
    dates: Date[]
    /** Has the requesting athlete joined the event? */
    joined: boolean
    /** Is it a private event? */
    private: boolean
    /** Women only? */
    womenOnly: boolean
    /** The organizer. */
    organizer?: Partial<StravaProfile>
    /** Start location. */
    address?: string
    /** Attached route. */
    route?: StravaRoute
}

/**
 * A strava Route.
 */
export interface StravaRoute {
    /** ID of the route. */
    id: string
    /** Name of the route. */
    name?: string
    /** Description of the route. */
    description?: string
    /** Ride or Run. */
    type?: StravaSport
    /** Route distance. */
    distance?: number
    /** Total elevation gain. */
    elevationGain?: number
    /** Estimated moving time in seconds. */
    estimatedTime?: number
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
 * FTP estimate for a batch of Strava activities.
 */
export interface StravaEstimatedFtp {
    /** Estimated FTP based on current and maximum calculated FTP values. */
    ftpWatts: number
    /** Current FTP taken from Strava. */
    ftpCurrentWatts: number
    /** Calculated FTP for the best activity. */
    bestWatts: number
    /** The activity that has the max calculated FTP. */
    bestActivity: StravaActivity
    /** How many activities with power? */
    activityCount: number
    /** Average watts for all activities with power. */
    activityWattsAvg: number
    /** Was the user's FTP recently updated? Use this to avoid back-to-back updates. */
    recentlyUpdated: boolean
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

/**
 * Strava activity map styles.
 */
export enum StravaMapStyle {
    Default = "default",
    SurfaceType = "surface_type",
    Elevation = "elevation",
    Gradient = "gradient",
    HeartRate = "heartrate",
    Pace = "pace",
    Speed = "speed",
    Temperature = "temperature",
    Time = "time",
    BlackLivesMatter = "black_lives_matter",
    Pride = "pride"
}
