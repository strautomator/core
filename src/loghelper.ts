// Strautomator Core: Log Helper

import {StravaActivity, StravaProcessedActivity} from "./strava/types"
import {UserData} from "./users/types"

/**
 * Helper to get user details for logging.
 * @param user User data.
 */
export const user = (user: UserData): string => {
    if (!user) return "User unknown"
    if (user.id && user.displayName) return `User ${user.id} ${user.displayName}`
    return user.id || user.displayName
}

/**
 * Helper to get activity details for logging.
 * @param activity Activity data.
 * @param fullDetails Optional, if true will return details about the activity.
 */
export const activity = (activity: StravaActivity | StravaProcessedActivity, fullDetails?: boolean): string => {
    if (!activity) return "Activity unknown"
    if (!fullDetails) return `Activity ${activity.id}`
}
