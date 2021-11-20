// Strautomator Core: User types

import {RecipeData} from "../recipes/types"
import {StravaProfile, StravaTokens} from "../strava/types"

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
    /** User strava access and refresh tokens. */
    stravaTokens?: StravaTokens
    /** User email, optional. */
    email?: string
    /** List of user recipes. */
    recipes?: UserRecipeMap
    /** User preferences. */
    preferences?: UserPreferences
    /** Calendar template. */
    calendarTemplate?: UserCalendarTemplate
    /** Subscription details (for PRO accounts). */
    subscription?: UserSubscriptionRef
    /** Custom URL token used to get the calendar. */
    urlToken?: string
    /** Last login date (UTC). */
    dateLogin?: Date
    /** Registration date (UTC). */
    dateRegistered?: Date
    /** Date of last received activity from Strava. */
    dateLastActivity?: Date
    /** Date of last activity updated by a recipe. */
    dateLastProcessedActivity?: Date
    /** Date when the user FTP was last updated. */
    dateLastFtpUpdate?: Date
    /** Recipes counter. */
    recipeCount?: number
    /** Processed activities counter. */
    activityCount?: number
    /** Temporarily disable processing user activities? */
    suspended?: boolean
    /** User needs to reauthenticate with Strava? An email will be sent if reauth is 2. */
    reauth?: number
}

/**
 * User preferences.
 */
export interface UserPreferences {
    /** Auto update cycling FTP based on activities from the last few weeks? */
    ftpAutoUpdate?: boolean
    /** Custom "linksOn" value for linkbacks (default is set on settings). */
    linksOn?: number
    /** Add a #strautomator.com hashtag on name of processed activities? */
    activityHashtag?: boolean
    /** Language (code) used for automations and weather tags. */
    language?: "en" | "de" | "es" | "fr" | "pt"
    /** Delay processing activities? */
    delayedProcessing?: boolean
    /** Opt in to have activities shared on Strautomator's Twitter? */
    twitterShare?: boolean
    /** Reset recipe counters every year? Set using the format MM-DD, or false to disable. */
    dateResetCounter?: string | false
    /** Prefered weather provider. */
    weatherProvider?: "tomorrow" | "openweathermap" | "stormglass" | "visualcrossing" | "weatherbit" | "weatherapi"
    /** Weather temperature unit. */
    weatherUnit?: "c" | "f"
    /** Privacy mode: do not save processed activities and records. */
    privacyMode?: boolean
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
 * User subscription (PRO) reference.
 */
export interface UserSubscriptionRef {
    /** Subscription ID. */
    id: string
    /** Subscription source. */
    source: "paypal" | "github" | "friend" | "revolut"
    /** Enabled? */
    enabled: boolean
}
