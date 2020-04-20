# Strautomator Core

This is the core module of Strautomator, and contains most of its busines logic. This project doesn't run by itself, but is used by the [Strautomator Web](https://github.com/strautomator/web).

### Settings

Strautomator is using the [SetMeUp](https://github.com/igoramadas/setmeup) module to handle its settings, so for detailed info please check its docs. The settings are splitted as follows:

- **settings.json** - general settings shared by all environments
- **settings.development.json** - development settings, mostly when running on your dev machine
- **settings.production.json** - production settings, except credentials and secrets
- **settings.secret.json** - private credentials and secrets, excluded from the GIT repo
- **GCS settings** - optional, will be downloaded from a Google Cloud Storage bucket on startup

Additionally, you can also define settings via environment variables, prefixed by SMU and separating blocks with underscore. So for instance to set the `app.title` via environment variables, you should set the value on `SMU_app_title`.

If you want to download settings from Google Cloud Storage, you must define the `settings.gcp.downloadSettings.bucket` either directly on one of the settings files, or via the `$SMU_gcp_downloadSettings_bucket` env variable. The default filename is `settings.secret.json`, but you can change that as well. The settings file downloaded from GCS will NOT persist on the disk.

Please note that settings specific to the web server, API and other web-specific things are defined on files directly on the [Strautomator Web](https://github.com/strautomator/web). Same naming convention.

### TypeScript vs Javascript

Whenever possible we'll use TypeScript to write the core logic of Strautomator. In other words, **always**. The TypeScript compiler is included as a package dependecy and compiled to JS right after install.

### Database

By default Strautomator will use the Google Cloud Firestore to store its data. But the [database wrapper](https://github.com/strautomator/core/blob/master/src/database/index.ts) was made in such a way that it should be pretty easy to implement other document based data stores as well, such as MongoDB or DynamoDB.

The following tables / collections are used:

- **users** registered user details
- **activities** summary of activities processed
- **activities-failed** summary of failed processed activities

### Make

There's a Makefile with a bunch of helper commands that you should use. For instance to update dependencies to their latest versions:

    $ make update

This will also control the module's versioning automatically. You should change the version on the package.json manually, ever.

## Why having 2 distinct repos / projects, you might ask...

First because the original plan for Strautomator was to be command line tool, and not a web app. Second, by keeping the core login decoupled from the web frontend we can easily reuse it on Cloud Functions and other platforms. It adds a bit of complexity on dependencies and build steps, but we think it's worth it.
