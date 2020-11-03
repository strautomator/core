// Strautomator Core: Message types

/**
 * Message from the system to a user.
 */
export interface UserMessage {
    /** Message indexed by ID. */
    id: string
    /** User ID. */
    userId: string
    /** Title of the message. */
    title: string
    /** Body of the message. */
    body: string
    /** Was the message read? */
    read: boolean
    /** Date message was created. */
    dateCreated: Date
    /** Date message was read by the user. */
    dateRead?: Date
    /** Expiry date (message won't show after that date). */
    dateExpiry?: Date
}
