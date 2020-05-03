// Strautomator Core: PayPal types

/**
 * PayPal auth with access token and expiry date.
 */
export interface PayPalAuth {
    /** PayPal OAuth2 access token. */
    accessToken: string
    /** Expiry timestamp (unix epoch). */
    expiresAt: number
}

/**
 * A PayPal billing plan.
 */
export interface PayPalBillingPlan {
    /** Billing plan ID. */
    id: string
    /** Billing plan name. */
    name: string
    /** Date when billing plan was created. */
    dateCreated: Date
    /** Billing frequency (month or year). */
    frequency?: string
    /** Is the billing plan currently enabled? */
    enabled?: boolean
}

/**
 * A PayPal product.
 */
export interface PayPalProduct {
    /** Product ID. */
    id: string
    /** Product name. */
    name: string
    /** Date when product was created. */
    dateCreated: Date
}

/**
 * A PayPal subscription (user donated to Strautomator).
 */
export interface PayPalSubscription {
    /** Subscription ID. */
    id: string
    /** Subscription status. */
    status: "APPROVAL_PENDING" | "APPROVED" | "ACTIVE" | "SUSPENDED" | "CANCELLED" | "EXPIRED"
    /** Billing plan details. */
    billingPlan: PayPalBillingPlan
    /** Date of creation of the subscription. */
    dateCreated: Date
    /** Date of last update of the subscription. */
    dateUpdated: Date
    /** Date of next payment. */
    dateNextPayment?: Date
    /** URL for the user to proceed and approve the subscription. */
    approvalUrl?: string
    /** Email of the subscriber. */
    email?: string
    /** Details of the last payment (if any was made). */
    lastPayment?: {
        /** Payment amount. */
        amount: number
        /** Payment currency. */
        currency: string
        /** Payment date. */
        date: Date
    }
}

/**
 * A PayPal transaction.
 */
export interface PayPalTransaction {
    /** Transaction ID. */
    id: string
    /** Transaction amount. */
    amount: number
    /** Transaction currency. */
    currency: string
    /** Transaction date. */
    date: Date
}
