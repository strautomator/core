// Strautomator Core: Mailer types

/**
 * Email sending options.
 */
export interface EmailSendingOptions {
    /** Recipient's email address. */
    to: string
    /** Email subject. */
    subject: string
    /** Optional from (default is taken from the settings). */
    from?: string
    /** Email contents . */
    body: string
    /** Objects user for tags replacement. */
    data?: any[]
}
