// Strautomator Core: Log Helper

import {EventEntity} from "@paddle/paddle-node-sdk"
import {FitFileActivity} from "./fitparser/types"
import {GarminPingActivityFile} from "./garmin/types"
import {GitHubSubscription} from "./github/types"
import {PaddleSubscription} from "./paddle/types"
import {PayPalSubscription} from "./paypal/types"
import {RecipeData} from "./recipes/types"
import {StravaActivity, StravaProcessedActivity} from "./strava/types"
import {BaseSubscription} from "./subscriptions/types"
import {UserData} from "./users/types"
import {WahooWebhookData} from "./wahoo/types"
import _ from "lodash"

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
 * Helper to get Garmin ping details for logging.
 * @param lPing FIT file activity data.
 */
export const garminPing = (lPing: GarminPingActivityFile): string => {
    if (!lPing) return "Ping unknown"
    const id = lPing.activityId.toString().replace("activity", "")
    const name = lPing.activityName
    return `Garmin activity ${id} - ${name}`
}

/**
 * Helper to get FIT file activity details for logging.
 * @param lActivity FIT file activity data.
 */
export const fitFileActivity = (lActivity: FitFileActivity): string => {
    if (!lActivity) return "Activity unknown"
    const details = _.compact([lActivity.name, lActivity.sportProfile, lActivity.workoutName])
    return `FIT ${lActivity.id} - ${details.join(", ")}`
}

/**
 * Helper to get the Paddle webhook event details for logging.
 * @param lEvent Paddle webhook event.
 */
export const paddleEvent = (lEvent: EventEntity): string => {
    if (!paddleEvent) return "Activity unknown"
    return `${lEvent.eventType}: ${lEvent.eventId} - ${lEvent.data.id}`
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
export const subscription = (lSubscription: BaseSubscription | GitHubSubscription | PaddleSubscription | PayPalSubscription): string => {
    if (!lSubscription) return "Subscription unknown"
    return `Subscription ${lSubscription.source} ${lSubscription.id} - ${lSubscription.status}`
}

/**
 * Helper to get subscription and user summary for logging.
 * @param lSubscription Subscription data.
 */
export const subscriptionUser = (lSubscription: BaseSubscription | GitHubSubscription | PaddleSubscription | PayPalSubscription): string => {
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

/**
 * Helper to get Wahoo webhook details for logging.
 * @param lData User data.
 */
export const wahooWebhook = (lData: WahooWebhookData): string => {
    if (!lData) return "User unknown"
    const user = `Wahoo user ${lData.user?.id || "unknown"}`
    const workout = `Workout ${lData.workout_summary?.id || "unknown"}`
    return `${lData.event_type}: ${user} - ${workout}`
}
