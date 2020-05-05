# Strautomator Core

This is the core module of Strautomator, and contains most of its business logic. This project doesn't run by itself, but is used by the [Strautomator Web](https://github.com/strautomator/web).

**Please note that Strautomator is still in beta! Its internals, API specs and general settings will likely change a lot before we hit a stable release.**

### Settings

Strautomator is using the [SetMeUp](https://github.com/igoramadas/setmeup) module to handle its settings, so for detailed info please check its docs. The settings are splitted as follows:

- **settings.json** - general settings shared by all environments
- **settings.development.json** - development settings, mostly when running on your dev machine
- **settings.production.json** - production settings, except credentials and secrets
- **settings.secret.json** - private credentials and secrets, excluded from the GIT repo
- **GCS settings** - optional, will be downloaded from a Google Cloud Storage bucket on startup

Additionally, you can also define settings via environment variables, prefixed by SMU and separating levels with underscore. So for instance to define the `app.title` via environment variables, you should set the value on `$SMU_app_title`. To define `gcp.projectId`, use `$SMU_gcp_projectId`. And so on.

If you want to download settings from Google Cloud Storage, you must define the `gcp.downloadSettings.bucket` (or via the `$SMU_gcp_downloadSettings_bucket` env variable). The default filename is `settings.secret.json`, but you can change that as well. The settings file downloaded from GCS will NOT persist on the disk.

Please note that settings specific to the web server, API and other web-specific features are defined on files directly on the [Strautomator Web](https://github.com/strautomator/web). Same naming convention.

### TypeScript vs Javascript

Whenever possible we'll use TypeScript to write the core logic of Strautomator. In other words, **always**. The TypeScript compiler is included as a package dependecy and compiled to JS right after install.

### Database

By default Strautomator uses Google Cloud Firestore to store its data. But the [database wrapper](https://github.com/strautomator/core/blob/master/src/database/index.ts) was made in such a way that it should be pretty easy to implement other document based data stores as well, such as MongoDB or DynamoDB.

The following tables / collections are used:

- **users** registered user details
- **activities** summary of activities processed
- **activities-failed** summary of failed processed activities
- **subscriptions** PRO accounts subscription data

### Make

All the necessary commands to update, build and deploy the Strautomator Core are done using make. For instance, to update the Node.js dependencies and set a new package version:

    $ make update

Or to do a "dry run" and test the startup routing with the current settings:

    $ make dry-run

Please have a look on the provided Makefile for all available commands.

