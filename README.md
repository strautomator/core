# Strautomator

Source code of [Strautomator.com](https://strautomator.com), a web app that automates your Strava activities, with features like automation recipes, GearWear mileage tracking, FTP auto-updating, calendar exports and much more.

This is a monorepo with 3 modules:

| Module                        | What it is                                                                 | Runs on                          |
| ----------------------------- | -------------------------------------------------------------------------- | -------------------------------- |
| [core](core#readme)           | Business logic, database, storage and 3rd party integrations (TypeScript). | Bundled into the web/functions.  |
| [web](web#readme)             | Website, API, webhooks and MCP server (Nuxt, Vue 3, Vuetify).              | Google Cloud Run                 |
| [functions](functions#readme) | Scheduled maintenance tasks (subscriptions, GearWear, cleanup, counters).  | Google Cloud Functions (1st gen) |

## Architecture

```
  Browser / MCP clients     Strava (login, webhooks)          Cloud Scheduler
            │                          │                      │             │
            │ HTTPS                    │       HTTP (queue)   │          Pub/Sub
            ▼                          ▼                      │             │
  ┌─────────────────────────────────────────────┐             │             ▼
  │               web (Cloud Run)               │◄────────────┘   ┌──────────────────────┐
  └──────────────────────┬──────────────────────┘                 │ functions (Cloud     │
                         │                                        │ Functions, 1st gen)  │
                         │                                        └──────────┬───────────┘
                         └──────────────────────┬────────────────────────────┘
                                   core (bundled into both)
                                                │
          ┌─────────────────┬───────────────────┼────────────────────┬──────────────────┐
          ▼                 ▼                   ▼                    ▼                  ▼
      Firestore       Cloud Storage       Strava API           3rd party APIs    Settings bucket
     (database)      (calendars, GDPR,                       (Garmin, Wahoo,    (encrypted secrets,
                      caches)                                 weather, AI...)    read at startup)
```

- The **core** is never deployed by itself. The web and functions depend on it as a local npm package (`file:../core`), so a change in the core is shipped together with both.
- The **web** handles everything user-facing: the Strava login, the dashboard, the API, and the Strava webhooks that trigger the automations when new activities are uploaded.
- The **functions** run on a schedule (hourly, daily, weekly, monthly and on weekends), triggered by Cloud Scheduler via Pub/Sub topics.
- The database is always **Google Cloud Firestore**, so a Google Cloud project is required even if you host the web somewhere else.
- Settings are handled by [SetMeUp](https://github.com/igoramadas/setmeup): default settings are in the repo, while secrets live in a git-ignored `settings.secret.json` (or in a GCS bucket in production).

## Quick start

You'll need **Node.js 20+** (26 recommended), **git**, **make**, a **Google Cloud project** with Firestore, and a **Strava API application**. The [web/SETUP.md](web/SETUP.md) guide explains how to create each of them, step by step.

**1. Clone and build the core.** The core must be installed first, as the web and functions install a copy of it. Its `npm install` also compiles it to `core/lib`.

```sh
git clone https://github.com/ramadasnet/strautomator.git
cd strautomator/core
npm install
```

**2. Set your credentials.** Save your GCP service account key as `~/gcp-strautomator.json`, then create the secret settings from the sample. At least `gcp.projectId`, `app.url` and the Strava API credentials must be set.

```sh
cd ../web
cp settings.secret.json.sample settings.secret.json
```

**3. Run the web.** This starts the Nuxt dev server on port 3000, with hot reload and the development scheduled jobs.

```sh
npm install
make run
```

**4. (Optional) Run the functions.** The functions only need the same secrets as the web. Always set `NODE_ENV=development` when running them locally, otherwise they will use the production settings and database collections.

```sh
cd ../functions
cp ../web/settings.secret.json .
npm install
make build
NODE_ENV=development node -e "require('./index.js').hourlyTasks().then(() => process.exit(0))"
```

Replace `hourlyTasks` with `dailyTasks`, `weeklyTasks`, `monthlyTasks` or `weekendMaintenance` to run the other tasks.

When you change the core, run `make build` on the `core` folder. The `make run` of the web and functions copy the freshly compiled core before starting.

## More documentation

- [core/README.md](core/README.md): 3rd party services, GCP credentials, settings, database collections and storage buckets.
- [web/README.md](web/README.md): web settings, URLs, tunnels, MCP server and server ports.
- [web/SETUP.md](web/SETUP.md): complete self-hosting guide, from zero to production, including troubleshooting.
- [functions/README.md](functions/README.md): the scheduled tasks and how to test them locally.

## Builds and deployments

Everything runs on Google Cloud Build, using the [cloudbuild.yaml](cloudbuild.yaml) on the repository root:

| Event                    | Trigger               | Result                                                                   |
| ------------------------ | --------------------- | ------------------------------------------------------------------------ |
| Pull request to `master` | `strautomator-pr`     | Build only (web image + functions), nothing is pushed or deployed.       |
| Push / merge to `master` | `strautomator-build`  | Build only (web image + functions), nothing is pushed or deployed.       |
| New `v*` tag             | `strautomator-deploy` | Build, push the web image (`:vX` and `:latest`), deploy web + functions. |

To release a new version to production, from an up-to-date `master` branch:

```sh
make deploy-git
```

This sets the new date-based version on the web and functions, commits it, creates a `vYY.WWD.1HHMM` tag and pushes it to GitHub.

Secrets are never part of this repository. The web and functions download the encrypted `settings.secret.json` from a GCS bucket at startup. The `strautomator-deploy` trigger sets the `_DEPLOY=true` and `_SETTINGS_BUCKET` substitutions, and the GCP project ID comes from Cloud Build itself, so these values are not stored in the repository.
