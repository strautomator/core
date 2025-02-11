// Strautomator Core: Strava types

import {AiProviderName} from "../ai/types"
import {Route} from "../routes/types"
import {KomootRoute} from "../komoot/types"
import {FitFileActivity} from "../fitparser/types"
import dayjs from "dayjs"

/**
 * An activity on Strava.
 */
export interface StravaActivity {
    /** Activity numeric ID. */
    id: number
    /** External ID (from the uploader service). */
    externalId?: string
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
    /** Marked as commute? */
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
    /** Hide start time? */
    hideStatStartTime?: boolean
    /** Activity done on a trainer machine? */
    trainer?: boolean
    /** Start date and time, local time. */
    dateStart?: Date
    /** End date and time, local time. */
    dateEnd?: Date
    /** Weekday. */
    weekday?: string
    /** Week of the year. */
    weekOfYear?: number
    /** Stores the original UTC offset (timezone) in minutes. */
    utcStartOffset?: number
    /** Total distance in kilometers. */
    distance?: number
    /** Total distance (raw value, always in meters). */
    distanceMeters?: number
    /** Distance units based on the user profile. */
    distanceUnit?: "km" | "mi"
    /** Total elevation gain in meters. */
    elevationGain?: number
    /** Maximum elevation. */
    elevationMax?: number
    /** Elevation unit. */
    elevationUnit?: "m" | "ft"
    /** Distance / climbing ratio: 19m per kilometer or 100ft per mile */
    climbingRatio?: number
    /** Total elapsed time in seconds. */
    totalTime: number
    /** Total elapsed time in the format HH:MM:SS. */
    totalTimeString?: string
    /** Moving time in seconds. */
    movingTime: number
    /** Moving time in the format HH:MM:SS. */
    movingTimeString?: string
    /** The activity has location coordinates? */
    hasLocation?: boolean
    /** Start location (latitude and longitude). */
    locationStart?: [number, number]
    /** End location (latitude and longitude). */
    locationEnd?: [number, number]
    /** Half-time location (latitude and longitude). */
    locationMid?: [number, number]
    /** Country (name) where the activity has started. */
    countryStart?: string
    /** Country (flag) where the activity has started. */
    countryFlagStart?: string
    /** Country (name) at the mid point of the activity. */
    countryMid?: string
    /** Country (flag) at the mid point of the activity. */
    countryFlagMid?: string
    /** Country (name) where the activity has ended. */
    countryEnd?: string
    /** Country (flag) where the activity has ended. */
    countryFlagEnd?: string
    /** Map encoded as polyline. */
    polyline?: string
    /** Gear used. */
    gear?: StravaGear
    /** Average speed (per hour). */
    speedAvg?: number
    /** Maximum speed (per hour). */
    speedMax?: number
    /** Speed unit. */
    speedUnit?: "km/h" | "mi/h"
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
    /** Average cadence (RPM). */
    cadenceAvg?: number
    /** Average cadence (SPM). */
    cadenceSpm?: number
    /** Has cadence data? */
    hasCadence?: boolean
    /** Calories. */
    calories?: number
    /** Relative effort (previously called suffer score). */
    relativeEffort?: number
    /** Perceived exertion, where 1 is easy and 10 is max effort.  */
    perceivedExertion?: number
    /** Training stress score. */
    tss?: number
    /** Average temperature. */
    temperature?: number
    /** Saved CO2. */
    co2Saved?: number
    /** Device name. */
    device?: string
    /** Was the activity created manually? */
    manual?: boolean
    /** Has photos? */
    hasPhotos?: boolean
    /** Activity flagged? */
    flagged?: boolean
    /** Activity map style. */
    mapStyle?: StravaMapStyle
    /** Activity icon (emoticon). */
    icon?: string
    /** Athlete count. */
    athleteCount?: number
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
    /** Was a link to Strautomator added to the activity (internal use only)? */
    linkback?: boolean
    /** Activity counter (extra field used exclusively when replacing activity tags). */
    counter?: number
    /** Flag: is the activity part of a batch processing operation? */
    batch?: boolean
    /** Weather summary. */
    weatherSummary?: string
    /** AI generated activity name. */
    aiName?: string
    /** Flag: provider used to generate the activity name. */
    aiNameProvider?: AiProviderName
    /** AI generated activity description. */
    aiDescription?: string
    /** Flag: provider used to generate the activity description. */
    aiDescriptionProvider?: AiProviderName
    /** AI generated activity insights. */
    aiInsights?: string
    /** Flag: provider used to generate the activity insights. */
    aiInsightsProvider?: AiProviderName
    /** Fields that were updated by Strautomator (internal use only). */
    updatedFields?: string[]
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
 * Combined activity streams. At the moment allowing only watts to be used.
 */
export interface StravaActivityStreams {
    /** Cadence data points. */
    cadence?: StravaStream
    /** Heart rate data points. */
    hr?: StravaStream
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
    /** Total elapsed time. */
    totalTime?: number
    /** Moving time in seconds. */
    movingTime?: number
    /** Total distance. */
    distance?: number
    /** Distance units based on the user profile. */
    distanceUnit?: "km" | "mi"
    /** Total elevation gain in meters. */
    elevationGain?: number
    /** Elevation unit. */
    elevationUnit?: "m" | "ft"
    /** Average speed (per hour). */
    speedAvg?: number
    /** Maximum speed (per hour). */
    speedMax?: number
    /** Average watts. */
    wattsAvg?: number
    /** Weighted average watts. */
    wattsWeighted?: number
    /** Max watts. */
    wattsMax?: number
    /** Watts per kilo. */
    wattsKg?: number
    /** Average heart rate. */
    hrAvg?: number
    /** Maximum heart rate. */
    hrMax?: number
    /** Average cadence (RPM). */
    cadenceAvg?: number
    /** Training stress score. */
    tss?: number
    /** Weather summary. */
    weatherSummary?: string
    /** User owner of the activity. */
    userId: string
    /** List of recipes applied to the activity. */
    recipes?: {
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
    updatedFields?: {
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
    /** Is it processing right now? */
    processing?: boolean
    /** How many times the service tried processing this activity? */
    retryCount?: number
    /** List of new records. */
    newRecords?: string[]
    /** Queued date. */
    dateQueued?: Date
    /** Processing date. */
    dateProcessed?: Date
    /** Device that recorded the activity. */
    device?: string
    /** Matching Garmin activity (not saved to the DB, must be populated separately). */
    garminActivity?: FitFileActivity
    /** Matching Wahoo activity (not saved to the DB, must be populated separately). */
    wahooActivity?: FitFileActivity
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
    /** Athlete ID, the same as the user ID stored on the database. */
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
    dateCreated?: Date
    /** Athlete's date of last update (on Strava). */
    dateUpdated?: Date
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
    /** User biological sex. */
    sex?: "M" | "F"
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
    /** Calculated averages based on moving time. */
    avg?: {
        /** First 10%. */
        first10pc?: number
        /** First half. */
        firstHalf?: number
        /** Second half. */
        secondHalf?: number
        /** Last 10%. */
        last10pc?: number
    }
}

/**
 * Strava activity stream percentiles.
 */
export interface StravaStreamPercentiles {
    /** First 10%. */
    first10pc?: number
    /** First half. */
    firstHalf?: number
    /** Second half. */
    secondHalf?: number
    /** Last 10%. */
    last10pc?: number
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
    /** Attached Strava or Komoot route. */
    route?: StravaRoute | KomootRoute
}

/**
 * A strava Route.
 */
export interface StravaRoute extends Route {
    /** String version of the route ID, must be used on the API endpoints. */
    idString?: string
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
    /** Get only activities after timestamp (DayJS or epoch). */
    after?: dayjs.Dayjs | number
    /** Get only activities before timestamp (DayJS or epoch). */
    before?: dayjs.Dayjs | number
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
    Satellite3D = "satellite_3d",
    Winter3D = "winter_3d",
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
 * Calculated fitness levels, from 1 (untrained) to 5 (elite).
 */
export enum StravaFitnessLevel {
    Untrained = 1,
    Average = 2,
    Athletic = 3,
    Pro = 4,
    Elite = 5
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
    Badminton = "Badminton",
    Canoeing = "Canoeing",
    Crossfit = "Crossfit",
    Elliptical = "Elliptical",
    Golf = "Golf",
    Handcycle = "Handcycle",
    HighIntensityIntervalTraining = "HighIntensityIntervalTraining",
    Hike = "Hike",
    IceSkate = "IceSkate",
    InlineSkate = "InlineSkate",
    Kayaking = "Kayaking",
    Kitesurf = "Kitesurf",
    NordicSki = "NordicSki",
    Pickleball = "Pickleball",
    Pilates = "Pilates",
    Racquetball = "Racquetball",
    RockClimbing = "RockClimbing",
    RollerSki = "RollerSki",
    Rowing = "Rowing",
    Sail = "Sail",
    Skateboard = "Skateboard",
    Snowboard = "Snowboard",
    Snowshoe = "Snowshoe",
    Soccer = "Soccer",
    Squash = "Squash",
    StairStepper = "StairStepper",
    StandUpPaddling = "StandUpPaddling",
    Surfing = "Surfing",
    TableTennis = "TableTennis",
    Tennis = "Tennis",
    Velomobile = "Velomobile",
    VirtualRow = "VirtualRow",
    WeightTraining = "WeightTraining",
    Wheelchair = "Wheelchair",
    Windsurf = "Windsurf",
    Workout = "Workout",
    Yoga = "Yoga"
}

/**
 * List of matching / similar base sports.
 */
export enum StravaBaseSport {
    GravelRide = "Ride",
    MountainBikeRide = "Ride",
    EBikeRide = "Ride",
    EMountainBikeRide = "Ride",
    VirtualRide = "Ride",
    TrailRun = "Run",
    VirtualRun = "Run",
    Walk = "Run",
    BackcountrySki = "AlpineSki",
    Crossfit = "Workout",
    Elliptical = "Workout",
    HighIntensityIntervalTraining = "Workout",
    Hike = "Run",
    NordicSki = "AlpineSki",
    Velomobile = "Ride",
    VirtualRow = "Rowing",
    WeightTraining = "Workout"
}

/**
 * List of activity properties that are tracked for records.
 */
export const StravaTrackedRecords = ["distance", "movingTime", "elevationGain", "speedMax", "speedAvg", "hrMax", "hrAvg", "wattsMax", "wattsAvg", "calories"]
