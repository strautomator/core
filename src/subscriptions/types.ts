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
    source: "amex" | "friend" | "github" | "paddle" | "paypal" | "revolut" | "traderepublic"
    /** Subscription status. */
    status: "APPROVAL_PENDING" | "APPROVED" | "TRIAL" | "ACTIVE" | "SUSPENDED" | "CANCELLED" | "EXPIRED"
    /** Payment currency. */
    currency?: string
    /** Payment price. */
    price?: number
    /** Subscription frequency. */
    frequency?: "monthly" | "yearly" | "lifetime"
    /** Date of creation of the subscription. */
    dateCreated?: Date
    /** Date of last update of the subscription. */
    dateUpdated?: Date
    /** Last payment summary. */
    dateLastPayment?: Date
    /** Next payment summary. */
    dateNextPayment?: Date
    /** Subscription end date. */
    dateExpiry?: Date
    /** Flag used to decide if subscription has pending updates to be saved to the database. */
    pendingUpdate?: boolean
}
