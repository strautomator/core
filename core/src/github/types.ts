// Strautomator Core: GitHub types

import {BaseSubscription} from "../subscriptions/types"

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
export interface GitHubSubscription extends BaseSubscription {
    /** Username of the sponsor. */
    username: string
}
