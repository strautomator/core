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
export const EmailBaseTemplate = "<div>${contents}</div><div>-<br /><small>Email sent by ${appTitle}</small><br /><a href='${appUrl}'>${appUrl}</a></div>"

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
        subject: "${gearName} - ${component} (GearWear alert)",
        body:
            "<p>" +
            "It's about time to replace this component :-)<br />-<br />" +
            "<strong>${gearName} - ${component}</strong><br />" +
            "Currently with ${currentDistance} ${units}, ${currentTime} hours<br />" +
            "Alert on: ${alertDetails}<br />-" +
            "</p>" +
            "<p>" +
            "To reset the current tracking, please <a href='${appUrl}gear/edit?id=${gearId}&reset=${component}'>click here</a> to go to the GearWear details on Strautomator. You should do this once you have replaced the component." +
            "</p>" +
            "<p>" +
            'Need to buy new components? Check the latest <a href="https://links.devv.com/l/bikes">deals on Amazon</a>!' +
            "</p>"
    },

    // Reminder sent if user hasn't reset the distance on a gear component after it reaches 120% of the distance threshold.
    GearWearReminder: {
        subject: "${gearName} - ${component} (GearWear reminder)",
        body:
            "<p>" +
            "This is a small reminder that you haven't reset the distance for the component below, yet :-)<br />-<br />" +
            "<strong>${gearName} - ${component}</strong><br />" +
            "Currently with ${currentDistance} ${units}, ${currentTime} hours<br />" +
            "Alert on: ${alertDetails}<br />-" +
            "</p>" +
            "<p>" +
            "To reset the current tracking, please <a href='${appUrl}gear/edit?id=${gearId}&reset=${component}'>click here</a> to go to the GearWear details on Strautomator. You should do this once you have replaced the component." +
            "</p>" +
            "<p>" +
            'Need to buy new components? Check the latest <a href="https://links.devv.com/l/bikes">deals on Amazon</a>!' +
            "</p>"
    },

    // When a Strava refresh token has expired and user needs to reauthenticate.
    StravaTokenExpired: {
        subject: "Please reconnect to Strautomator",
        body:
            "<p>" +
            "Hi ${userName}!<br /><br />" +
            "It looks like the connection between Strautomator and your Strava account has expired.<br />" +
            "If you wish to keep using Strautomator, please reauthenticate at <a href='${appUrl}auth/login'>${appUrl}auth/login</a>" +
            "" +
            "</p>" +
            "<p>" +
            "<small>Technical details: the OAuth2 refresh token that we have is not valid any longer.</small>" +
            "</p>"
    },

    UnreadNotifications: {
        subject: "You have ${count} unread notifications",
        body:
            "<p>" +
            "Hi ${userName}!<br /><br />" +
            "It might have been a while since you last checked your account on Strautomator... and there are some unread notifications for you:<br><br>-" +
            "${notifications}</p>" +
            "<p>" +
            'Please go to <a href="${appUrl}account/notifications">My Notifications</a> for more details.' +
            "</p>"
    }
}
