// Strautomator Core: Last.fm types

/**
 * Last.fm API request options.
 */
export interface LastfmRequestOptions {
    /** Body to be posted to the API. */
    data?: any
    /** Request method. */
    method?: "GET" | "POST"
    /** Additional request headers. */
    headers?: any
    /** Querystring parameters. */
    params?: any
    /** Path to be appended to the base API URL. */
    path?: string
    /** Target request URL including https://. */
    url?: string
}

/**
 * Last.fm linked profile details.
 */
export interface LastfmProfile {
    /** Last.fm username (used as the profile ID). */
    username: string
    /** Total number of scrobbled tracks. */
    playcount?: number
}
