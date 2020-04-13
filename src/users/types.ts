// Strautomator Core: User types

import {PayPalTransaction} from "../paypal/types"
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
    id?: string
    /** User profile data from Strava. */
    profile: StravaProfile
    /** User strava access and refresh tokens. */
    stravaTokens?: StravaTokens
    /** Strava subscription numeric ID (used for webhooks). */
    stravaSubscription?: number
    /** User email, optional. */
    email?: string
    /** List of user recipes. */
    recipes?: UserRecipeMap
    /** List of user payments. */
    payments?: PayPalTransaction[]
    /** Last login date (UTC). */
    dateLogin?: Date
    /** Registration date (UTC). */
    dateRegistered?: Date
    /** Next billing date (UTC). */
    dateBilling?: Date
    /** Date of last received activity from Strava. */
    dateLastActivity?: Date
    /** Units (imperial or metric). */
    units?: string
    /** Recipes counter. */
    recipeCount?: number
    /** Processed activities counter. */
    activityCount?: number
}
