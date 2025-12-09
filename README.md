# Strautomator Core

This is the core module of Strautomator, containing most of its business logic. This project doesn't run by itself, but is used by the [Web](https://github.com/strautomator/web) and [Functions](https://github.com/strautomator/functions).

## Getting started

Some main points to know before you start:

-   Code is mostly TypeScript
-   Should run on Node 20+
-   Optimized for GCP (Google Cloud Platform)

### 3rd party services

Required integrations:

-   [GCP](https://console.cloud.google.com/apis/credentials)
-   [Strava API](https://www.strava.com/settings/api)

Additional integrations:

-   Garmin Connect API
-   GitHub API
-   LocationIQ API
-   musixmatch API
-   Paddle API
-   PayPal API
-   Spotify API
-   Wahoo Cloud API
-   Chatbase API
-   AI providers: Anthropic, Gemini, Mistral, OpenAI, xAI, OpenRouter
-   Weather providers: Open-Meteo, OpenWeatherMap, Tomorrow.io, Visual Crossing, WeatherAPI

Please note that most of the services listed above have a free / trial version, which should be enough for testing or a single user use case. For power users, you might need to subscribe to paid plans.

If you are not planning to use a specific integration, you can simply add the "disabled" flag to one of the settings.json files. Please note that by doing so, some features might not work properly.

### Getting your GCP credentials

Once you have created a project in GCP, it's recommended to [create](https://console.cloud.google.com/iam-admin/serviceaccounts/create) a dedicated service account with full permissions to Firestore and Storage Buckets. You could also use an existing service account, as long as you make sure it has the aforementioned permissions.

You'll need to download a set of JSON credentials for that account:

1. Open the credentials [overview](https://console.cloud.google.com/apis/credentials).
2. On the Service Accounts list, click on the desired service account email.
3. Go to the `Keys` tab, then click on `Add Key` > `Create new key`.
4. Select `JSON` format and create.
5. Save the file as `~/gcp-strautomator.json`, on your home folder.

## Settings

Strautomator is using the [SetMeUp](https://github.com/igoramadas/setmeup) module to handle its settings, so for detailed info please check its docs. The settings are split as follows:

-   **settings.json** - settings shared by all environments, targeting production by default
-   **settings.development.json** - development settings, mostly when running on your dev machine
-   **settings.production.json** - production-only settings, except credentials and secrets (optional)
-   **settings.secret.json** - private credentials and secrets, excluded from the GIT repo
-   **GCS settings** - optional, will be downloaded from a Google Cloud Storage bucket on startup

Additionally, you can also define settings via environment variables, prefixed by SMU and separating levels with underscore. So for instance to define the `app.title` via an environment variable, you should set the value on `$SMU_app_title`. To define `gcp.projectId`, use `$SMU_gcp_projectId`. And so on.

If you want to download settings from Google Cloud Storage, you must define the `gcp.downloadSettings.bucket` (or via the `$SMU_gcp_downloadSettings_bucket` env variable). The default filename is `settings.secret.json`, but you can change that as well. The settings file downloaded from GCS will NOT persist on the disk.

Please note that settings specific to the web server, API and other web-specific features are defined on files directly on the [Strautomator Web](https://github.com/strautomator/web). Same procedure, same logic.

## Database

By default Strautomator uses Google Cloud Firestore to store its data. But the [database wrapper](https://github.com/strautomator/core/blob/master/src/database/index.ts) was made in such a way that it should be pretty easy to implement other document based data stores as well, like MongoDB or DynamoDB.

The following collections are used:

-   **app-state** general application state
-   **activities** processed activities
-   **announcements** website announcements
-   **athlete-records** athlete sports records
-   **calendars** exported Strava calendars
-   **faq** help questions and answers
-   **garmin** cached Garmin data
-   **gearwear** GearWear configurations
-   **komoot** cached Komoot routes
-   **lyrics** cached Lyrics from musixmatch
-   **maps** cached geolocation data
-   **notifications** notifications to users
-   **recipe-stats** automation recipe stats
-   **subscriptions** PRO subscriptions
-   **strava-cache** cached responses from Strava
-   **users** registered user details
-   **wahoo** cached Wahoo data

These collections might have a suffix, depending on the settings. On development, the default suffix is `-dev`.

Some indexes are needed in Firestore. At the moment there's no automated creation, so you might see some warnings or errors on the logs asking to create an index before a specific query can be executed. Just follow the links provided directly on the console logs.

## Storage

Strautomator will store some files on Google Cloud Storage buckets:

-   **cache**: generic cache bucket, at the moment used only for affiliate feed caching
-   **calendar**: cached calendar outputs, default name is `bucket-calendar.strautomator.com`
-   **gdpr**: ZIP archives requested by users, default name is `bucket-gdpr.strautomator.com`

Buckets can have an optional TTL (days) policy, also defined on the settings as "ttlDays". If a bucket does not exist, it will be created during startup. If no "location" is set directly on the bucket settings, then the default is taken from the setting `gcp.location`.

By default, buckets in production are created as CNAME records. This can be disabled by setting the `settings.storage.cname` flag to false.

### IAM policy

Please make sure that the service account being used has full permissions to read and write to your GCP project Storage buckets. Otherwise you'll have to create the buckets manually and assign the required permissions via the GCP Console.

## Make

All the necessary commands to update, build and deploy the Strautomator Core are done using make. For instance, to update the Node.js dependencies and set a new package version:

    $ make update

Or to do a "dry run" and test the startup routine with the current settings:

    $ make dry-run

Please have a look on the provided Makefile for all available commands.
