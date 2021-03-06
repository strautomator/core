# Strautomator Core

This is the core module of Strautomator containing most of its business logic. This project doesn't run by itself, but is used by the [Strautomator Web](https://github.com/strautomator/web) and can be linked on other environments as well (Cloud Functions, CLI tools etc...).

## Getting started

### Settings

Strautomator is using the [SetMeUp](https://github.com/igoramadas/setmeup) module to handle its settings, so for detailed info please check its [docs](https://setmeup.devv.com). The settings are splitted as follows:

- **settings.json** - general settings shared by all environments
- **settings.development.json** - development settings, mostly when running on your dev machine
- **settings.production.json** - production settings, except credentials and secrets
- **settings.secret.json** - private credentials and secrets, excluded from the GIT repo
- **GCS settings** - optional, will be downloaded from a Google Cloud Storage bucket on startup

Additionally, you can also define settings via environment variables, prefixed by SMU and separating levels with underscore. So for instance to define the `app.title` via an environment variable, you should set the value on `$SMU_app_title`. To define `gcp.projectId`, use `$SMU_gcp_projectId`. And so on.

If you want to download settings from Google Cloud Storage, you must define the `gcp.downloadSettings.bucket` (or via the `$SMU_gcp_downloadSettings_bucket` env variable). The default filename is `settings.secret.json`, but you can change that as well. The settings file downloaded from GCS will NOT persist on the disk.

Please note that settings specific to the web server, API and other web-specific features are defined on files directly on the [Strautomator Web](https://github.com/strautomator/web). Same procedure, same naming convention.

### Database

By default Strautomator uses Google Cloud Firestore to store its data. But the [database wrapper](https://github.com/strautomator/core/blob/master/src/database/index.ts) was made in such a way that it should be pretty easy to implement other document based data stores as well, such as MongoDB or DynamoDB.

The following collections are currently used:

- **activities** summary of processed activities
- **app-state** general application state
- **calendar** cached calendar data
- **faq** help questions and answers
- **gearwear** GearWear configurations
- **recipe-stats** automation recipe stats
- **subscriptions** subscriptions data
- **users** registered user details

Also note that these collections might have a suffix, depending on the settings. On development, the default suffix is `-dev`.

### 3rd party integrations

You'll have to register an account and get the necessary credentials for the 3rd party integrations:

- Google Cloud Platform
- Strava API
- PayPal API
- Twitter API
- Weather providers (ClimaCell, Storm Glass etc...)

If you need help getting any of those, or have questions, just open a [new issue](https://github.com/strautomator/core/issues/new) and I'll be glad to help.

### Make

All the necessary commands to update, build and deploy the Strautomator Core are done using make. For instance, to update the Node.js dependencies and set a new package version:

    $ make update

Or to do a "dry run" and test the startup routine with the current settings:

    $ make dry-run

Please have a look on the provided Makefile for all available commands.

## Scheduled Tasks

Some of Strautomator's features depend on scheduled tasks that needs to be setup manually. They are:

#### GearWear: process recent activities

The function `gearwear.processRecentActivities()` needs to be called once a day to fetch recent activies for all users and update the distance / hours of their GearWear components accordingly.

#### Strava: refresh tokens

Users with expired tokens must have their Strava tokens refreshed regularly. You can use a mix of `users.getExpired()`, iterating these users and calling `strava.refreshToken()` for each one of them.
