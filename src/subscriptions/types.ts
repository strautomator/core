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
    source: "friend" | "github" | "paypal" | "revolut"
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
}
