# Strautomator Functions

These are Strautomator's functions that should be set to run on a scheduled basis, and depend on the [Strautomator Core](../core) to work. Some of these functions are required for core features to work (ie. GearWear mileage tracking, FTP auto-updating, etc), while others are optional (Strava cache cleanup, User subscription checks, etc).

They run in production via Google Cloud Functions (1st gen) triggered by Pub/Sub topics + Cloud Scheduler, but should work just fine with other setups and environments as well.

## Scheduled tasks

The [index.js](index.js) exports one entry point per schedule:

| Entry point          | Pub/Sub topic         | Schedule (Europe/Berlin) | Main tasks                                                                              |
| -------------------- | --------------------- | ------------------------ | --------------------------------------------------------------------------------------- |
| `hourlyTasks`        | `hourly-tasks`        | Every hour               | Regenerate calendars, check the Strava API status.                                      |
| `dailyTasks`         | `daily-tasks`         | Daily at 22:00           | GearWear processing, Strava webhook and cache cleanup, recipe counters, Spotify expiry. |
| `weeklyTasks`        | `weekly-tasks`        | Wednesdays at 20:00      | Athlete performance processing, non-active subscriptions, usage counters.               |
| `monthlyTasks`       | `monthly-tasks`       | On the 15th at 06:00     | Email reminders, idle GearWear, archived stats, Paddle / GitHub / PayPal subscriptions. |
| `weekendMaintenance` | `weekend-maintenance` | Sundays at 10:00         | Old activities and idle users cleanup, fitness levels, Spotify / Garmin / Wahoo tokens. |

Each entry point starts the core with only the modules it needs.

## Local testing

Before you try to testing these functions locally, make sure you have followed the [Getting started](../core#getting-started) instructions to have all the required 3rd party dependencies ready. Install the core dependencies first (`cd ../core && npm install`), as the functions install a copy of the local core.

The functions use the same secrets as the web, so the easiest way is to copy (or symlink) its `settings.secret.json`:

```sh
cp ../web/settings.secret.json .
npm install
make build
```

Then run the desired entry point. **Always set `NODE_ENV=development`**, otherwise the core will not load its development settings, and will use the production database collections and storage buckets:

```sh
NODE_ENV=development node -e "require('./index.js').hourlyTasks().then(() => process.exit(0))"
```

If you changed the core, run `make run` once, as it copies the freshly compiled `../core/lib` and settings into `node_modules/strautomator-core`.

## Deploying to production

The functions are deployed automatically, together with the web, when a new version tag is pushed. See the [cloudbuild.yaml](../cloudbuild.yaml) on the repository root for the full deployment specs. As Cloud Functions only receive the `functions` folder, the build packs the local core into a tarball and sets it as the `strautomator-core` dependency.

Secrets are not part of the source code. At startup, the core downloads the encrypted `settings.secret.json` from the GCS bucket defined in the `SMU_gcp_downloadSettings_bucket` environment variable, and decrypts it using the `SMU_CRYPTO_KEY` environment variable.
