// Strautomator Core: Log Helper

import {GarminActivity, GarminPingActivityFile} from "./garmin/types"
import {GitHubSubscription} from "./github/types"
import {PayPalSubscription} from "./paypal/types"
import {RecipeData} from "./recipes/types"
import {StravaActivity, StravaProcessedActivity} from "./strava/types"
import {BaseSubscription} from "./subscriptions/types"
import {UserData} from "./users/types"

/**
 * Helper to get activity details for logging.
 * @param lActivity Activity data.
 * @param fullDetails Optional, if true will return details about the activity.
 */
export const activity = (lActivity: StravaActivity | StravaProcessedActivity, fullDetails?: boolean): string => {
    if (!lActivity) return "Activity unknown"
    if (!fullDetails) return `Activity ${lActivity.id}`
}

/**
 * Helper to get Garmin activity details for logging.
 * @param lActivity Activity data.
 */
export const garminActivity = (lActivity: GarminActivity | GarminPingActivityFile): string => {
    if (!lActivity) return "Activity unknown"
    const id = (lActivity["id"] || lActivity["activityId"]).replace("activity", "")
    const name = lActivity["name"] || lActivity["activityName"]
    return `Activity ${id} - ${name}`
}

/**
 * Helper to get automation recipe details for logging.
 * @param lRecipe Recipe data.
 * @param fullDetails Optional, if true will return details about the activity.
 */
export const recipe = (lRecipe: RecipeData): string => {
    if (!lRecipe) return "recipe unknown"
    const conditonsLog = lRecipe.defaultFor ? `D${lRecipe.defaultFor.length}` : `C${lRecipe.conditions.length}`
    const actionsLog = `A${lRecipe.actions.length}`
    if (lRecipe.id && lRecipe.title) return `Recipe ${lRecipe.id}: ${lRecipe.title} (${conditonsLog} ${actionsLog})`
    return lRecipe.id
}

/**
 * Helper to get subscription details for logging.
 * @param lSubscription Subscription data.
 */
export const subscription = (lSubscription: BaseSubscription | GitHubSubscription | PayPalSubscription): string => {
    if (!lSubscription) return "Subscription unknown"
    return `Subscription ${lSubscription.source} ${lSubscription.id} - ${lSubscription.status}`
}

/**
 * Helper to get subscription and user summary for logging.
 * @param lSubscription Subscription data.
 */
export const subscriptionUser = (lSubscription: BaseSubscription | GitHubSubscription | PayPalSubscription): string => {
    if (!lSubscription) return "Subscription unknown"
    return `User ${lSubscription.userId} - Subscription ${lSubscription.source} ${lSubscription.id} (${lSubscription.status})`
}

/**
 * Helper to get user details for logging.
 * @param lUser User data.
 */
export const user = (lUser: UserData | Partial<UserData>): string => {
    if (!lUser) return "User unknown"
    if (lUser.id && lUser.displayName) return `User ${lUser.id} ${lUser.displayName}`
    return lUser.id || lUser.displayName
}
