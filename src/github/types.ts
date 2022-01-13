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
