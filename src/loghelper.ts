// Strautomator Core: Log Helper

import {GarminActivity, GarminPingActivity} from "./garmin/types"
import {RecipeData} from "./recipes/types"
import {StravaActivity, StravaProcessedActivity} from "./strava/types"
import {UserData} from "./users/types"

/**
 * Helper to get activity details for logging.
 * @param activity Activity data.
 * @param fullDetails Optional, if true will return details about the activity.
 */
export const activity = (activity: StravaActivity | StravaProcessedActivity, fullDetails?: boolean): string => {
    if (!activity) return "Activity unknown"
    if (!fullDetails) return `Activity ${activity.id}`
}

/**
 * Helper to get Garmin activity details for logging.
 * @param activity Activity data.
 */
export const garminActivity = (activity: GarminActivity | GarminPingActivity): string => {
    if (!activity) return "Activity unknown"
    return `Activity ${activity["id"] || activity["activityId"]} - ${activity["name"] || activity["activityName"]}`
}

/**
 * Helper to get automation recipe details for logging.
 * @param recipe Recipe data.
 * @param fullDetails Optional, if true will return details about the activity.
 */
export const recipe = (recipe: RecipeData): string => {
    if (!recipe) return "recipe unknown"
    const conditonsLog = recipe.defaultFor ? `D${recipe.defaultFor.length}` : `C${recipe.conditions.length}`
    const actionsLog = `A${recipe.actions.length}`
    if (recipe.id && recipe.title) return `Recipe ${recipe.id}: ${recipe.title} (${conditonsLog} ${actionsLog})`
    return recipe.id
}

/**
 * Helper to get user details for logging.
 * @param user User data.
 */
export const user = (user: UserData): string => {
    if (!user) return "User unknown"
    if (user.id && user.displayName) return `User ${user.id} ${user.displayName}`
    return user.id || user.displayName
}
