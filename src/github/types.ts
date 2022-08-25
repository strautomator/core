// Strautomator Core: GitHub types

/**
 * Release / tag based change log.
 */
export interface GitHubChangelog {
    /** Release tag. */
    [tag: string]: {
        /** Description. */
        changes: string[]
        /** Date published. */
        datePublished: Date
    }
}

/**
 * A GitHub subscription (sponsorship).
 */
export interface GitHubSubscription {
    /** Subscription ID. */
    id: string
    /** User ID (set when subscribing, might be null when only fetching subscriptions from PayPal). */
    userId: string
    /** Subscription status. */
    status?: "ACTIVE" | "CANCELLED"
    /** Date of creation of the subscription. */
    dateCreated: Date
    /** Date of last update of the subscription. */
    dateUpdated: Date
    /** Details of the last payment (if any was made). */
    monthlyPrice?: number
}
