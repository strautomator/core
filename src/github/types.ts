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
 * GitHub commit details.
 */
export interface GitHubCommit {
    /** Repository. */
    repo: string
    /** Commit message. */
    message: string
    /** Commit date. */
    dateCommitted: Date
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
    /** Monthly price paid. */
    monthlyPrice?: number
    /** Date of creation of the subscription. */
    dateCreated: Date
    /** Date of last update of the subscription. */
    dateUpdated: Date
    /** Expiry date (used mostly in case of one-time payments). */
    dateExpiry?: Date
}
