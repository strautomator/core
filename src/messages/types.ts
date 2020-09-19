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
    /** Date message was created. */
    dateCreated: Date
    /** Date message was read by the user. */
    dateRead?: Date
}
