// Strautomator Core: Subscription types

/**
 * User subscription (PRO) reference.
 */
export interface BaseSubscription {
    /** Subscription ID. */
    id: string
    /** User ID (set after subscription is created). */
    userId: string
    /** Subscription source. */
    source: "amex" | "friend" | "github" | "paypal" | "n26" | "revolut" | "traderepublic"
    /** Subscription status. */
    status: "APPROVAL_PENDING" | "APPROVED" | "ACTIVE" | "SUSPENDED" | "CANCELLED" | "EXPIRED"
    /** Subscription currency. */
    currency?: string
    /** Price paid. */
    price?: number
    /** Subscription frequency. */
    frequency?: "monthly" | "yearly" | "lifetime"
    /** Date of creation of the subscription. */
    dateCreated?: Date
    /** Date of last update of the subscription. */
    dateUpdated?: Date
    /** Subscription end date. */
    dateExpiry?: Date
    /** Flag used to decide if subscription has pending updates to be saved to the database. */
    pendingUpdate?: boolean
}
