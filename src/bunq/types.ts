// Strautomator Core: bunq types

/**
 * Defines payment options.
 */
export interface BunqPayment {
    /** Payment ID. */
    id?: number
    /** Date and time of payment. */
    date: Date
    /** Payment description. */
    description: string
    /** Payment amount. */
    amount: number
}

/**
 * Bunq user data as a JSON object.
 */
export interface BunqUser {
    /** Unique user ID on bunq. */
    id: number
    /** User email. */
    email: string
    /** Source payment account. */
    sourceAccount: string
    /** Target payment account. */
    targetAccount: string
    /** Default price per kilometer. */
    pricePerKm: number
    /** Default price per climbed kilometer. */
    pricePerClimbedKm: number
    /** Payment interval (weekly or monthly). */
    interval?: "weekly" | "monthly"
    /** Last authorization date. */
    dateAuth: Date
    /** Encryption key used during bunq communications. */
    cryptoKey: string
    /** Session store used by the bunq client. */
    sessionStore: any
}
