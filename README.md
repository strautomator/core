# Strautomator Core

This is the core module of Strautomator, containing most of its business logic. This project doesn't run by itself, but is used by the [Strautomator Web](https://github.com/strautomator/web) and can be linked on other environments as well (Cloud Functions, CLI tools etc...).

## Getting started

### Settings

Strautomator is using the [SetMeUp](https://github.com/igoramadas/setmeup) module to handle its settings, so for detailed info please check its [docs](https://setmeup.devv.com). The settings are split as follows:

-   **settings.json** - settings shared by all environments, targeting production by default
-   **settings.development.json** - development settings, mostly when running on your dev machine
-   **settings.production.json** - production-only settings, except credentials and secrets (optional)
-   **settings.secret.json** - private credentials and secrets, excluded from the GIT repo
-   **GCS settings** - optional, will be downloaded from a Google Cloud Storage bucket on startup

Additionally, you can also define settings via environment variables, prefixed by SMU and separating levels with underscore. So for instance to define the `app.title` via an environment variable, you should set the value on `$SMU_app_title`. To define `gcp.projectId`, use `$SMU_gcp_projectId`. And so on.

If you want to download settings from Google Cloud Storage, you must define the `gcp.downloadSettings.bucket` (or via the `$SMU_gcp_downloadSettings_bucket` env variable). The default filename is `settings.secret.json`, but you can change that as well. The settings file downloaded from GCS will NOT persist on the disk.

Please note that settings specific to the web server, API and other web-specific features are defined on files directly on the [Strautomator Web](https://github.com/strautomator/web). Same procedure, same naming convention.

### Database

By default Strautomator uses Google Cloud Firestore to store its data. But the [database wrapper](https://github.com/strautomator/core/blob/master/src/database/index.ts) was made in such a way that it should be pretty easy to implement other document based data stores as well, such as MongoDB or DynamoDB.

The following collections are currently used:

-   **activities** processed activities
-   **announcements** website announcements
-   **app-state** general application state
-   **athlete-records** athlete sports records
-   **calendar** cached calendars
-   **faq** help questions and answers
-   **gearwear** GearWear configurations
-   **notifications** notifications to users
-   **recipe-stats** automation recipe stats
-   **subscriptions** PRO subscriptions
-   **users** registered user details

Also note that these collections might have a suffix, depending on the settings. On development, the default suffix is `-dev`.

### 3rd party integrations

You'll have to register an account and get the necessary credentials for the 3rd party integrations:

-   Google Cloud Platform
-   Strava API
-   PayPal API
-   Twitter API
-   Weather providers (Tomorrow.io, Storm Glass etc...)

If you need help getting any of those, or have questions, just open a [new issue](https://github.com/strautomator/core/issues/new) and I'll be glad to help.

### Make

All the necessary commands to update, build and deploy the Strautomator Core are done using make. For instance, to update the Node.js dependencies and set a new package version:

    $ make update

Or to do a "dry run" and test the startup routine with the current settings:

    $ make dry-run

Please have a look on the provided Makefile for all available commands.

## Scheduled Tasks

Some of Strautomator's features depend on scheduled tasks that needs a manual setup. For instance, using the GCP Cloud Functions + Cloud Scheduler.

### Calendar

-   **calendar.deleteExpired()** - daily, delete expired cached calendars.

### GearWear

-   **gearwear.processRecentActivities()** - daily, fetch recent activities and update the GearWear counters.

### Notifications

-   **notifications.cleanup()** - weekly, cleanup old notifications.
-   **notifications.sendEmailReminders()** - monthly, send email reminders to users that have too many unread notifications.

### Strava

-   **strava.activities.getQueuedActivities()** - daily, iterate (and if necessary remove) failed queued activities.

### Users

-   **users.subscriptions.getDangling()** - weekly, iterate (and if necessary cleanup) dangling PRO subscriptions.
-   **users.subscriptions.getNonActive()** - weekly, iterate and switch users with an invalid subscription back to Free.
-   **users.ftp.estimateFtp() + users.ftp.saveFtp()** - weekly, get all PRO users, estimate their FTP and update on Strava if necessary.
-   **users.getByResetCounter() + recipes.stats.setCounter** - daily, get and reset counters for users matching today's date.
-   **recipes.stats.getFailingRecipes()** - weekly, iterate (and if necessary disable) recipes that keep failing.
