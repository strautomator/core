// Strautomator Core: User types

import {AiProviderName} from "../ai/types"
import {FitDeviceNames} from "../fitparser/types"
import {GarminProfile} from "../garmin/types"
import {RecipeData} from "../recipes/types"
import {SpotifyProfile} from "../spotify/types"
import {StravaFitnessLevel, StravaProfile, StravaTokens} from "../strava/types"
import {WahooProfile} from "../wahoo/types"

/**
 * Key-value list of recipes.
 */
export interface UserRecipeMap {
    /** Recipe indexed by ID. */
    [id: string]: RecipeData
}

/**
 * User data as a JSON object, as stored on the database.
 */
export interface UserData {
    /** Unique ID, same as Strava's athlete ID. */
    id: string
    /** User's display (taken from one of the user profile fields). */
    displayName?: string
    /** Is activated with a Pro account? */
    isPro?: boolean
    /** User profile data from Strava. */
    profile: StravaProfile
    /** Estimated fitness level. */
    fitnessLevel?: StravaFitnessLevel
    /** User strava access and refresh tokens. */
    stravaTokens?: StravaTokens
    /** User email, optional. */
    email?: string
    /** User country code, taken from the Strava profile or connecting IP. */
    countryCode?: string
    /** User email to be confirmed, prefixed by the confirmation token and using ":" as separator. */
    confirmEmail?: string
    /** List of user recipes. */
    recipes?: UserRecipeMap
    /** User preferences. */
    preferences?: UserPreferences
    /** FTP status. */
    ftpStatus?: UserFtpStatus
    /** Linked Garmin account. */
    garmin?: GarminProfile
    /** Garmin authentication state. */
    garminAuthState?: string
    /** Garmin repeated failures count. */
    garminFailures?: number
    /** Linked Spotify account. */
    spotify?: SpotifyProfile
    /** Spotify authentication state. */
    spotifyAuthState?: string
    /** Linked Wahoo profile. */
    wahoo?: WahooProfile
    /** Wahoo authentication state. */
    wahooAuthState?: string
    /** Names given to device IDs by the user. */
    fitDeviceNames?: FitDeviceNames
    /** Custom URL token used to get the calendar. */
    urlToken?: string
    /** User's customer ID at Paddle. */
    paddleId?: string
    /** Last transaction ID at Paddle. */
    paddleTransactionId?: string
    /** User's subscription ID. */
    subscriptionId?: string
    /** Last login date (UTC). */
    dateLogin?: Date
    /** Registration date (UTC). */
    dateRegistered?: Date
    /** Date when the auth last failed. */
    dateAuthFailed?: Date
    /** Date of last received activity from Strava. */
    dateLastActivity?: Date
    /** Date of last activity updated by a recipe. */
    dateLastProcessedActivity?: Date
    /** Date when the user last triggered a batch processing. */
    dateLastBatchProcessing?: Date
    /** Date when the last GDPR archive download was requested. */
    dateLastArchiveGenerated?: Date
    /** Recipes counter. */
    recipeCount?: number
    /** Processed activities counter. */
    activityCount?: number
    /** Enable debugging logs for the user? */
    debug?: boolean
    /** Temporarily disable the user? */
    suspended?: boolean
    /** Temporarily disable writing to Strava? */
    writeSuspended?: boolean
    /** Authentication error count. */
    authFailures?: number
}

/**
 * User preferences.
 */
export interface UserPreferences {
    /** Auto update cycling FTP based on activities from the last few weeks? */
    ftpAutoUpdate?: boolean
    /** Custom "linksOn" value for backlinks (default is set on settings). */
    linksOn?: number
    /** Add a #strautomator.com hashtag on name of processed activities? */
    activityHashtag?: boolean
    /** Language (code) used for automations and weather tags. */
    language?: "en" | "de" | "es" | "fr" | "it" | "lt" | "nl" | "pl" | "pt" | "se" | "sk"
    /** Delay processing activities? */
    delayedProcessing?: boolean
    /** How many days to delay the calculations of new GearWear mileage / hours. */
    gearwearDelayDays?: number
    /** Enable alerts when a device is reporting low battery? */
    gearwearBatteryAlert?: number
    /** Reset recipe counters every year? Set using the format MM-DD, or false to disable. */
    dateResetCounter?: string | false
    /** Preferred weather provider. */
    weatherProvider?: "tomorrow" | "openweathermap" | "visualcrossing" | "weatherapi" | "openmeteo"
    /** Weather temperature unit. */
    weatherUnit?: "c" | "f"
    /** Wind speed unit. */
    windSpeedUnit?: "m/s" | "kph" | "mph"
    /** First day of week, defaults to sunday. */
    firstDayOfWeek?: "sunday" | "monday"
    /** Calendar template. */
    calendarTemplate?: UserCalendarTemplate
    /** Enable AI features? */
    aiEnabled?: boolean
    /** Preferred AI provider. */
    aiProvider?: AiProviderName
    /** Omit suffixes when replacing activity tags? */
    noSuffixes?: boolean
    /** Privacy mode: do not save processed activities and records. */
    privacyMode?: boolean
    /** Show ads in the website (in case of PRO account)? */
    showAds?: boolean
}

/**
 * User calendar template for event summary and details.
 */
export interface UserCalendarTemplate {
    /** Custom event summary. */
    eventSummary?: string
    /** Custom event details. */
    eventDetails?: string
}

/**
 * User FTP update status.
 */
export interface UserFtpStatus {
    /** The Strava activity ID. */
    activityId: number
    /** Previous FTP value. */
    previousFtp: number
    /** Date of update. */
    dateUpdated: Date
}
