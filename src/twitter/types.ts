// Strautomator Core: Twitter types

/**
 * Cached data from Twitter.
 */
export interface TwitterState {
    /** Twitter screen name. */
    screenName?: string
    /** Date when the rate limit expires (if rate limited). */
    dateRateLimitReset?: Date
    /** Date when account details were refreshed. */
    dateAccountRefreshed?: Date
}
