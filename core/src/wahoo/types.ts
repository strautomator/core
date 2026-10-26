// Strautomator Core: Wahoo types

/**
 * Wahoo linked profile details.
 */
export interface WahooProfile {
    /** Wahoo user ID. */
    id?: string
    /** User's email. */
    email?: string
    /** Wahoo tokens. */
    tokens?: WahooTokens
}

/**
 * Wahoo authentication tokens.
 */
export interface WahooTokens {
    /** Access token. */
    accessToken: string
    /** Refresh token. */
    refreshToken?: string
    /** Expiry timestamp. */
    expiresAt?: number
}

/**
 * Activity details from Wahoo.
 */
export interface WahooActivity {
    /** Wahoo activity ID. */
    id: string
    /** Wahoo activity name. */
    name: string
    /** Total duration in minutes. */
    minutes?: number
    /** Average speed. */
    speedAvg?: number
    /** Link to the Wahoo original activity file. */
    fileUrl?: string
    /** Activity UTC start date. */
    dateStart?: Date
}

/**
 * Webhook payload dispatched by Wahoo.
 */
export interface WahooWebhookData {
    event_type: string
    webhook_token: string
    user: {
        id: number
    }
    workout_summary?: {
        id: number
        distance_accum: number
        file?: {
            url: string
        }
        workout?: {
            id: number
            name: string
            minutes: number
            starts: string
        }
    }
}
