// Strautomator Core: Strava types

import {KomootRoute} from "../komoot/types"
import dayjs from "dayjs"

/**
 * An activity on Strava.
 */
export interface StravaActivity {
    /** Activity numeric ID. */
    id: number
    /** Activity basic type (Ride, Run, etc). */
    type: StravaSport
    /** Activity extended sport type (includes Gravel Ride, Mountain Bike Ride, Trail Run, etc) */
    sportType?: StravaSport
    /** Workout (ride or run) type. */
    workoutType?: StravaRideType | StravaRunType
    /** Activity name. */
    name: string
    /** Activity description or details. */
    description?: string
    /** Private note (visible to the owner only). */
    privateNote?: string
    /** Is the activity private? */
    private?: boolean
    /** Marked as coomute? */
    commute?: boolean
    /** Activity hidden on the home feed? */
    hideHome?: boolean
    /** Hide pace on the activity stats? */
    hideStatPace?: boolean
    /** Hide speed on the activity stats? */
    hideStatSpeed?: boolean
    /** Hide calories on the activity stats? */
    hideStatCalories?: boolean
    /** Hide heart on the activity stats? */
    hideStatHeartRate?: boolean
    /** Hide power on the activity stats? */
    hideStatPower?: boolean
    /** Activity done on a trainer machine? */
    trainer?: boolean
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
    /** Falh-time location (latitude and longitude). */
    locationMid?: [number, number]
    /** Map encoded as polyline. */
    polyline?: string
    /** Gear used. */
    gear?: StravaGear
    /** Average speed (per hour). */
    speedAvg?: number
    /** Maximum speed (per hour). */
    speedMax?: number
    /** Average pace (per km/mi), as string. */
    paceAvg?: string
    /** Maximum pace (per km/mi), as string. */
    paceMax?: string
    /** Average watts. */
    wattsAvg?: number
    /** Weighted average watts. */
    wattsWeighted?: number
    /** Max watts. */
    wattsMax?: number
    /** Watts per kilo. */
    wattsKg?: number
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
    /** Training sress score. */
    tss?: number
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
    /** Lap count. */
    lapCount?: number
    /** Lap distance (most common or average). */
    lapDistance?: number
    /** Lap time (most common or average). */
    lapTime?: number
    /** List of new all time activity-property records. */
    newRecords?: string[]
    /** List of segment personal bests. */
    prSegments?: string[]
    /** List of segment KOMs. */
    komSegments?: string[]
    /** Fields that were updated by Strautomator (internal use only). */
    updatedFields?: string[]
    /** Was a link to Strautomator added to the activity (internal use only)? */
    linkback?: boolean
}

/**
 * A summary of the activity performance.
 */
export interface StravaActivityPerformance {
    /** Maximum average 5 minutes power. */
    power5min?: number
    /** Maximum average 20 minutes power. */
    power20min?: number
    /** Maximum average 60 minutes power. */
    power60min?: number
}

/**
 * Combined activity streams.
 */
export interface StravaActivityStreams {
    /** Distance data points. */
    distance?: StravaStream
    /** Heart rate data points. */
    heartrate?: StravaStream
    /** Time data points. */
    time?: StravaStream
    /** Power data points. */
    watts?: StravaStream
}

/**
 * Processed or queued activity details to be saved on the database.
 */
export interface StravaProcessedActivity {
    /** Activity ID. */
    id: number
    /** Activity extended sport type (includes Gravel Ride, Mountain Bike Ride, Trail Run, etc) */
    sportType?: StravaSport
    /** Name of the saved activity. */
    name?: string
    /** Start date of the activity. */
    dateStart?: Date
    /** Original UTC offset (timezone) of the activity. */
    utcStartOffset?: number
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
    /** Is the (old) activity part of a batch processing? */
    batch?: boolean
    /** List of new records. */
    newRecords?: string[]
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
    primary?: boolean
    /** Total distance (taken from Strava, respecting the user's units). */
    distance?: number
}

/**
 * Strava activity lap details.
 */
export interface StravaLap {
    /** Lap distance. */
    distance: number
    /** Lap total elapsed time. */
    totalTime: number
    /** Lap moving time. */
    movingTime: number
    /** Average speed. */
    speed: number
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
    /** User's weight (in kg). */
    weight?: number
}

/**
 * Strava athlete stats.
 */
export interface StravaProfileStats {
    /** Longest ride distance.  */
    biggestRideDistance?: number
    /** Highest climb ridden. */
    biggestRideClimb?: number
    /** Recent ride total stats. */
    recentRideTotals?: StravaTotals
    /** Recent run total stats. */
    recentRunTotals?: StravaTotals
    /** Recent swim total stats. */
    recentSwimTotals?: StravaTotals
    /** All time ride total stats. */
    allRideTotals?: StravaTotals
    /** All time run total stats. */
    allRunTotals?: StravaTotals
    /** All time swim total stats. */
    allSwimTotals?: StravaTotals
}

/**
 * Represents an activity stream with data points.
 */
export interface StravaStream {
    /** Stream type. */
    type?: "distance" | "heartrate" | "time" | "watts"
    /** Stream resolution. */
    resolution?: "high" | "medium" | "low"
    /** Data points, usually indexed by seconds. */
    data?: number[]
}

/**
 * Activity total statistics.
 */
export interface StravaTotals {
    /** How many activities. */
    count?: number
    /** Total distance. */
    distance?: number
    /** Total (elapsed) time.  */
    totalTime?: number
    /** Moving time. */
    movingTime?: number
    /** Total elevation gain. */
    elevationGain?: number
    /** Achievements count. */
    achievements?: number
}

/**
 * Strava athlete's records by sport's type.
 */
export type StravaAthleteRecords = {
    /** Records by each Strava sport. */
    [sport in StravaSport]?: StravaRecords
} & {
    /** Same as the user ID. */
    id?: string
    /** Date when records were last refreshed manually. */
    dateRefreshed?: Date
}

/**
 * Strava records for an individual sport.
 */
export interface StravaRecords {
    /** Longest distance. */
    distance?: StravaRecordDetails
    /** Longest by moving time. */
    movingTime?: StravaRecordDetails
    /** Highest elevation gain. */
    elevationGain?: StravaRecordDetails
    /** Highest max speed. */
    speedMax?: StravaRecordDetails
    /** Highest average speed (only activities with more than 20 minutes). */
    speedAvg?: StravaRecordDetails
    /** Highest max heart rate. */
    hrMax?: StravaRecordDetails
    /** Highest average heart rate (only activities with more than 1 hour). */
    hrAvg?: StravaRecordDetails
    /** Highest max power. */
    wattsMax?: StravaRecordDetails
    /** Highest average power (only activities with more than 20 minutes). */
    wattsAvg?: StravaRecordDetails
    /** Highest calories expenditure. */
    calories?: StravaRecordDetails
}

/**
 * Represents a personal record.
 */
export interface StravaRecordDetails {
    /** Personal record value. */
    value?: number
    /** Previous record value. */
    previous?: number
    /** The activity ID. */
    activityId?: number
    /** The date when the record was broken. */
    date?: Date
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
    /** Access token expiry timestamp (in seconds). */
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
    /** The club profile icon. */
    icon?: string
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
    /** The event ID. */
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
    /** The club ID and name. */
    club?: Partial<StravaClub>
    /** The organizer. */
    organizer?: Partial<StravaProfile>
    /** Start location (address). */
    address?: string
    /** Attached Strava route. */
    route?: StravaRoute
    /** Extracted Komoot route. */
    komootRoute?: KomootRoute
}

/**
 * A strava Route.
 */
export interface StravaRoute {
    /** ID of the route. */
    id: string
    /** String version of the route ID, must be used on the API endpoints. */
    idString?: string
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
    /** Route encoded polyline. */
    polyline?: string
    /** Starting location as coordinates. */
    locationStart?: [number, number]
    /** Starting location as coordinates. */
    locationEnd?: [number, number]
    /** Mid point location as coordinates. */
    locationMid?: [number, number]
    /** Terrain type. */
    terrain?: StravaRouteTerrain
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
 * Strava activity filters (for instance when batch processing).
 */
export interface StravaActivityFilter {
    /** Just private activities if true, only public if false, otherwise all. */
    private?: boolean
    /** Just commutes if true, not commutes if false, otherwise all. */
    commute?: boolean
    /** Just races if true, not races if false, otherwise all. */
    race?: boolean
    /** Specific sport type, otherwise all. */
    sportType?: StravaSport
}

/**
 * Strava activity query filter (used to fetch activities).
 */
export interface StravaActivityQuery {
    /** Get only activities after timestamp. */
    after?: dayjs.Dayjs
    /** Get only activities before timestamp. */
    before?: dayjs.Dayjs
    /** Current page. */
    page?: number
    /** Activities per page. */
    per_page?: number
}

/**
 * Strava cached response (saved on the database).
 */
export interface StravaCachedResponse {
    /** The unique cache ID. */
    id: string
    /** Resource type (based on cache key). */
    resourceType: string
    /** The cached data. */
    data: any
    /** Date when it was cached. */
    dateCached: Date
    /** Date when it should expire (used for the Firestore TTL). */
    dateExpiry?: Date
}

/**
 * Strava sport types.
 */
export enum StravaSport {
    Ride = "Ride",
    GravelRide = "GravelRide",
    MountainBikeRide = "MountainBikeRide",
    EBikeRide = "EBikeRide",
    EMountainBikeRide = "EMountainBikeRide",
    VirtualRide = "VirtualRide",
    Run = "Run",
    TrailRun = "TrailRun",
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
 * Strava sport-specific types, used to match the correct
 * activity_type and sport_type on activities.
 */
export const StravaSportRefs = {
    GravelRide: "Ride",
    MountainBikeRide: "Ride",
    EMountainBikeRide: "EBikeRide",
    TrailRun: "Run"
}

/**
 * Strava "Ride" workout types.
 */
export enum StravaRideType {
    Race = 11,
    Workout = 12
}

/**
 * Strava "Run" workout types.
 */
export enum StravaRunType {
    Race = 1,
    LongRun = 2,
    Workout = 3
}

/**
 * Strava route terrain types.
 */
export enum StravaRouteTerrain {
    MostlyFlat = 0,
    RollingHills = 1,
    KillerClimbs = 2
}

/**
 * Strava activity map styles.
 */
export enum StravaMapStyle {
    Default = "default",
    Sattelite3D = "satellite_3d",
    SurfaceType = "surface_type",
    Elevation = "elevation",
    Gradient = "gradient",
    HeartRate = "heartrate",
    Pace = "pace",
    Power = "power",
    Speed = "speed",
    Temperature = "temperature",
    Time = "time",
    Heatmap = "heatmap",
    StravaMetro = "metro",
    BlackLivesMatter = "black_lives_matter",
    Pride = "pride",
    SupportUkraine = "ukraine"
}

/**
 * List of activity properties that are trackerd for records.
 */
export const StravaTrackedRecords = ["distance", "movingTime", "elevationGain", "speedMax", "speedAvg", "hrMax", "hrAvg", "wattsMax", "wattsAvg", "calories"]
