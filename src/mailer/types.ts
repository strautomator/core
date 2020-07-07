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
export const EmailBaseTemplate = "<div>${contents}</div><div>-<br /><small>Email automatically sent by ${appTitle} (do not reply)</small></div>"

/**
 * Email templates.
 */
export const EmailTemplates = {
    // Below are the list of email templates (subject and body).

    // When a recipe action fails to execute.
    RecipeFailedAction: {
        subject: "Failed automation: ${recipeTitle}",
        body:
            "<p>" +
            "Hello there!<br /><br />" +
            "Just to let you know that one of your automations failed to execute properly, so you might waant to double check its configuration." +
            "</p>" +
            "<p>" +
            "<strong>${recipeTitle}</strong><br />" +
            "Action: ${action}<br />" +
            "Message: ${errorMessage}<br />" +
            "Activity: ID ${activityId}, on ${activityDate}" +
            "</p>" +
            "<p>" +
            "Please <a href='${appUrl}automations/edit?id=${recipeId}'>click here</a> to check the automation details on Strautomator." +
            "</p>"
    },

    // Alert sent to user when a gear component has passed the defined distance.
    GearWearAlert: {
        subject: "GearWear alert! ${gearName} - ${component}",
        body:
            "<p>" +
            "<strong>${gearName} - ${component}</strong><br />" +
            "Currently with ${currentDistance} ${units}, ${currentTime} hours<br />" +
            "Alert on: ${alertDetails}" +
            "</p>" +
            "<p>" +
            "To reset the current tracking, please <a href='${appUrl}gear/edit?id=${gearId}&reset=${component}'>click here</a> to go to the GearWear details on Strautomator." +
            "</p>"
    },

    // Reminder sent if user hasn't reset the distance on a gear component after it reaches 120% of the distance threshold.
    GearWearReminder: {
        subject: "GearWear reminder! ${gear} - ${component}",
        body:
            "<p>" +
            "This is a small reminder that you haven't reset the distance for the gear / component below.<br /><br />" +
            "<strong>${gearName} - ${component}</strong><br />" +
            "Currently with ${currentDistance} ${units}, ${currentTime} hours<br />" +
            "Alert on: ${alertDetails}" +
            "</p>" +
            "<p>" +
            "To reset the current tracking, please <a href='${appUrl}gear/edit?id=${gearId}&reset=${component}'>click here</a> to go to the GearWear details on Strautomator." +
            "</p>"
    }
}
