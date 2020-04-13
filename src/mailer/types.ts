// Strautomator Core: Mailer types

/**
 * Email sending options.
 */
export interface EmailSendingOptions {
    /** Recipient's email address. */
    to: string
    /** Email subject. */
    subject: string
    /** Email body. */
    body: string
    /** Objects user for tags replacement. */
    data?: any[]
}
