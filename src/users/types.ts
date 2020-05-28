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
    /** Subscription details (for PRO accounts). */
    subscription?: UserSubscription
    /** ID of the bunq account (if registered). */
    bunqId?: string
    /** Last login date (UTC). */
    dateLogin?: Date
    /** Registration date (UTC). */
    dateRegistered?: Date
    /** Date of last received activity from Strava. */
    dateLastActivity?: Date
    /** Recipes counter. */
    recipeCount?: number
    /** Processed activities counter. */
    activityCount?: number
    /** Temporarily disable processing user activities? */
    suspended?: boolean
}

/**
 * User preferences.
 */
export interface UserPreferences {
    /** Add a #strautomator.com hashtag on name of processed activities? */
    activityHashtag?: boolean
    /** Language used on automations. Lowercased 2 letter country code. */
    language?: string
    /** Opt in to have activities shared on Strautomator's Twitter? */
    twitterShare?: boolean
    /** Prefered weather provider. */
    weatherProvider?: "climacell" | "darksky" | "openweathermap" | "weatherbit" | "weatherapi"
    /** Weather temperature unit. */
    weatherUnit?: "c" | "f"
}

/**
 * User subscription (PRO) summary.
 */
export interface UserSubscription {
    /** Subscription ID. */
    id: string
    /** Subscription source. */
    source: "paypal" | "github" | "friend"
    /** Enabled? */
    enabled: boolean
}
