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
export interface GitHubSubscription extends BaseSubscription {
    /** Username of the sponsor. */
    username: string
}
