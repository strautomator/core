// Strautomator Core: Mailer types

/**
 * Email sending options.
 */
export interface EmailSendingOptions {
    /** Recipient's email address. */
    to: string
    /** Email subject. */
    subject?: string
    /** Optional from (default is taken from the settings). */
    from?: string
    /** Template to be used for the email body. */
    template?: string
    /** Body of the email (in case there's no template). */
    body?: string
    /** Objects user for tags replacement. */
    data?: any
}

/**
 * The base template used on all sent emails.
 */
export const EmailBaseTemplate = "<div>[[contents]]</div><div>-<br /><small>Email sent by the ${appTitle} (do not reply)</small></div>"

/**
 * Email templates.
 */
export const EmailTemplates = {
    // Alert sent to user when a gear component has passed the defined mileage.
    GearWearAlert: {
        subject: "Gear mileage alert! ${gear} - ${component}",
        body:
            "<p>" +
            "Gear: ${gearName} - ${component},<br />" +
            "Current mileage: ${currentMileage} ${units}<br />" +
            "Alert mileage: every ${alertMileage} ${units}" +
            "</p>" +
            "<p>" +
            "To reset the current mileage, please go to your <a href='${appUrl}gear/edit?id=${gearId}&reset=true'>Gears</a> section on Strautomator." +
            "</p>"
    },
    // Reminder sent if user hasn't reset the mileage on a gear component after it reaches 120% of the mileage threshold.
    GearWearReminder: {
        subject: "Gear mileage reminder! ${gear} - ${component}",
        body:
            "<p>" +
            "This is a small reminder that you haven't reset the mileage for the gear / component below.<br /><br />" +
            "Gear: ${gearName} - ${component},<br />" +
            "Current mileage: ${currentMileage} ${units}<br />" +
            "Alert mileage: every ${alertMileage} ${units}" +
            "</p>" +
            "<p>" +
            "To reset the current mileage, please go to your <a href='${appUrl}gear/edit?id=${gearId}&reset=true'>Gears</a> section on Strautomator." +
            "</p>"
    }
}
