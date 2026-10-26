// Strautomator Core: Paddle types

import {BaseSubscription} from "../subscriptions/types"

/**
 * A Paddle subscription (user subscribed to Strautomator).
 */
export interface PaddleSubscription extends BaseSubscription {
    /** Paddle customer ID. */
    customerId?: string
    /** Email used at the subscription. */
    email?: string
    /** Last transaction ID. */
    transactionId?: string
    /** Discount given. */
    discount?: number
    /** Tax charged by Paddle. */
    tax?: number
}
