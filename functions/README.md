# Strautomator Functions

These are Strautomator's functions that should be set to run on a scheduled basis, and depend on the [Strautomator Core](../core) to work. Some of these functions are required for core features to work (ie. GearWear mileage tracking, FTP auto-updating, etc), while others are optional (Strava cache cleanup, User subscription checks, etc).

They run in production via Google Cloud Functions (1st gen) triggered by Pub/Sub topics + Cloud Scheduler, but should work just fine with other setups and environments as well.

The index.js file contain a sample of routines that should be executed on a hourly, daily, weekly and monthly basis.

## Local testing

Before you try to testing these functions locally, make sure you have followed the [Getting started](../core#getting-started) instructions to have all the required 3rd party dependencies ready. Install the core dependencies first (`cd ../core && npm install`), as the functions install a copy of the local core.

## Deploying to production

The functions are deployed automatically, together with the web, when a new version tag is pushed. See the [cloudbuild.yaml](../cloudbuild.yaml) on the repository root for the full deployment specs. As Cloud Functions only receive the `functions` folder, the build packs the local core into a tarball and sets it as the `strautomator-core` dependency.

Secrets are not part of the source code. At startup, the core downloads the encrypted `settings.secret.json` from the GCS bucket defined in the `SMU_gcp_downloadSettings_bucket` environment variable, and decrypts it using the `SMU_CRYPTO_KEY` environment variable.
