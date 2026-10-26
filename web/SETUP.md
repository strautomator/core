# Self-hosting Strautomator: step-by-step setup

This guide walks you through getting your own Strautomator instance running, either on your local machine or on a VPS. Plan on 1 to 2 hours for the first setup, most of it spent registering with the required 3rd party services.

> **Heads up:** Strautomator should work fine when self-hosted, but some defaults assume the official infrastructure. This guide lists every setting you need to change, but some static pages might still point to strautomator.com.

## Contents

1. [How it fits together](#1-how-it-fits-together)
2. [Prerequisites](#2-prerequisites)
3. [Clone the repositories](#3-clone-the-repositories)
4. [Get a public HTTPS URL](#4-get-a-public-https-url)
5. [Register on the required services](#5-register-on-the-required-services)
6. [Register on optional services](#6-register-on-optional-services)
7. [Create your settings files](#7-create-your-settings-files)
8. [Run it locally](#8-run-it-locally)
9. [Run it on a VPS (production mode)](#9-run-it-on-a-vps-production-mode)
10. [Troubleshooting](#10-troubleshooting)
11. [Updating](#11-updating)

---

## 1. How it fits together

```
                 Strava (OAuth login + webhooks)
                               │
Browser ──HTTPS──► Cloudflare (tunnel or proxy) ──► Strautomator Web (Node.js / Nuxt, this repo)
                                                        │   └── strautomator-core (business logic, npm dependency)
                                                        ├──► Google Cloud Firestore (database)
                                                        ├──► Google Cloud Storage (calendars, GDPR exports, caches)
                                                        ├──► Google Maps APIs (geocoding, static maps)
                                                        └──► optional: weather, music, email, AI, Garmin, Wahoo...
```

- **[strautomator/web](https://github.com/strautomator/web)** (this repo) is the website and API.
- **[strautomator/core](https://github.com/strautomator/core)** has most of the business logic and its own default settings. It is installed as an npm dependency of the web.
- **[strautomator/functions](https://github.com/strautomator/functions)** has scheduled jobs for production. You don't need them for a local setup. See [section 9](#scheduled-jobs) for details.

The database is always **Google Cloud Firestore**, even if you run the app on a VPS somewhere else. You need a Google Cloud project, but the free tier is enough for personal use.

## 2. Prerequisites

| What                                      | Why                                  | Notes                                                                                                                                                                                                    |
| ----------------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Node.js 20+** (26 recommended)          | Runs the app                         | Nothing enforces a version; the bundled Dockerfile uses Node 26, so that's the safest choice. Install it from [nodejs.org](https://nodejs.org/en/download) or with [nvm](https://github.com/nvm-sh/nvm). |
| **git** and **make**                      | Clone and run                        | On macOS, run `xcode-select --install`. On Debian/Ubuntu, run `sudo apt install git make build-essential`.                                                                                               |
| **A Strava account**                      | Login and activity data              | Any free account works.                                                                                                                                                                                  |
| **A Google account with billing enabled** | Firestore, Storage, Maps             | Google Maps needs a billing account. The monthly free credit covers personal use.                                                                                                                        |
| **A domain on Cloudflare** (recommended)  | Public HTTPS URL for Strava webhooks | You can skip this with a Cloudflare _quick tunnel_, a reverse proxy, or plain `localhost`. See [section 4](#4-get-a-public-https-url).                                                                   |
| **cloudflared** (recommended)             | Creates the tunnel                   | Install it with `brew install cloudflared` or [another method](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/).                                                 |

## 3. Clone the repositories

Create a root folder and clone **both** repositories as siblings. `make run` expects the core repo at `../core`.

```sh
mkdir ~/strautomator
cd ~/strautomator
git clone https://github.com/strautomator/core.git
git clone https://github.com/strautomator/web.git
```

Your folder should look like this:

```
~/strautomator/
├── core/
└── web/
```

Install the dependencies and compile the core:

```sh
cd ~/strautomator/core
npm install
make build

cd ~/strautomator/web
npm install
```

> **Using the `make update` when self-hosting.** It's a maintainer command. It needs `npm-check-updates` installed globally, bumps nearly every dependency to its latest version, and changes the package version. Use plain `npm install` to get the known-good dependency versions when installing the system on your "production" environment.

## 4. Get a public HTTPS URL

Strava pushes new activities to your instance through **webhooks**, so your instance must be reachable from the internet over HTTPS. Choose your URL before you register the services in [section 5](#5-register-on-the-required-services), because several of them ask for it.

The URL you choose becomes the `app.url` setting. **It must end with a trailing slash**, for example `https://strautomator.example.com/`.

The dev server blocks requests to unknown hostnames. It allows the `app.url` host from `settings.local.json`, `settings.secret.json` or the `SMU_app_url` environment variable, so you don't need to add the domain to any committed file.

### Option A: Named Cloudflare Tunnel (recommended)

This option gives you a stable URL on your own domain. You don't need to open ports on your router, and you don't need to manage certificates. It's also the default in development mode: when `app.tunnel` is `true`, the app runs the `./tunnel` script automatically at startup.

1. Add your domain to Cloudflare. The free plan is fine.
2. Authenticate cloudflared, create the tunnel, and add a DNS record for it:
   ```sh
   cloudflared tunnel login
   cloudflared tunnel create strautomator
   cloudflared tunnel route dns strautomator strautomator.example.com
   ```
3. The `create` command prints a tunnel ID and writes a credentials file to `~/.cloudflared/<TUNNEL-ID>.json`. Copy the file into the web repo:
   ```sh
   mkdir -p ~/strautomator/web/.cloudflared
   cp ~/.cloudflared/<TUNNEL-ID>.json ~/strautomator/web/.cloudflared/credentials.json
   ```
4. Create `~/strautomator/web/.cloudflared/config.yml`:
   ```yaml
   tunnel: <TUNNEL-ID>
   credentials-file: .cloudflared/credentials.json
   noTLSVerify: true
   ingress: [{service: http://localhost:3000}]
   ```
5. Set `app.url` to `https://strautomator.example.com/`.

The `.cloudflared` folder is git-ignored, so the tunnel credentials won't be committed. For more details, see [Create a locally-managed tunnel](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/local-management/create-local-tunnel/).

### Option B: Cloudflare quick tunnel (no domain, good for a quick test)

```sh
cloudflared tunnel --url http://localhost:3000
```

This command prints a random `https://<something>.trycloudflare.com` URL. **The URL changes every time you restart the tunnel**, and each time you'll have to update `app.url` and the Strava callback domain. Set `app.tunnel` to `false`, because this tunnel runs outside the app.

### Option C: Your own reverse proxy (nginx, Caddy, Traefik...) without Cloudflare

This works, but you **must** set `api.requireCloudflare` to `false`. Otherwise every `/api`, `/auth` and `/mcp` request fails with _401 Access denied_. See [Troubleshooting](#10-troubleshooting). Also set `app.tunnel` to `false`.

### Option D: localhost only

Set `app.url` to `http://localhost:3000/`, `app.tunnel` to `false` and `api.requireCloudflare` to `false`. You can log in and use the website, but Strava **can't send webhooks** to `localhost`. New activities won't be processed automatically, and the logs will show webhook errors. This setup is only good for UI work.

## 5. Register on the required services

> **About screenshots:** third-party dashboards change often and need a logged-in account, so this guide lists the exact fields you need to fill in instead. Each section links to the official guide, which usually has up-to-date screenshots.

### 5.1 Google Cloud Platform (required)

Strautomator uses Firestore as its database, Cloud Storage for files, and the Google Maps APIs for geocoding.

**a) Create a project**

1. Go to https://console.cloud.google.com/projectcreate and create a project, for example `my-strautomator`.
2. Write down the **Project ID**. It's often different from the project name. You'll use it for the `gcp.projectId` setting.
3. Link a billing account at https://console.cloud.google.com/billing.

**b) Create the Firestore database**

1. Open https://console.cloud.google.com/firestore.
2. Click **Create database**.
3. Keep the database ID as **`(default)`**.
4. Choose **Native mode**, not Datastore mode.
5. Pick a location close to you, for example `eur3` or `nam5`.
6. Choose **production rules**. The app accesses Firestore with a service account, so client rules don't matter.

The app creates its collections automatically. In development they get a `-dev` suffix, for example `users-dev`. For background, see [Create a Firestore database](https://cloud.google.com/firestore/docs/create-database-server-client-library).

**c) Enable the APIs**

Open each link and click **Enable**:

- Cloud Firestore API: https://console.cloud.google.com/apis/library/firestore.googleapis.com
- Cloud Storage API: https://console.cloud.google.com/apis/library/storage.googleapis.com
- Geocoding API: https://console.cloud.google.com/apis/library/geocoding-backend.googleapis.com
- Maps Static API: https://console.cloud.google.com/apis/library/static-maps-backend.googleapis.com
- (Optional, for Gemini AI features) Vertex AI API: https://console.cloud.google.com/apis/library/aiplatform.googleapis.com

**d) Create a service account and download its key**

1. Go to https://console.cloud.google.com/iam-admin/serviceaccounts/create.
2. Enter a name, for example `strautomator`.
3. Grant it these roles:
   - **Cloud Datastore User**, to read and write Firestore.
   - **Storage Admin**, because the app creates buckets and sets lifecycle rules at startup.
   - (Optional) **Vertex AI User**, for Gemini.
4. Open the service account, go to **Keys**, then click **Add key** > **Create new key** > **JSON**.
5. Save the file as **`~/gcp-strautomator.json`** in your home folder. In development the app looks for this path automatically. Anywhere else, set `GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json`.

> Never commit this JSON key. Anyone who has it can read and write your database.

**e) Create a Google Maps API key**

1. Go to https://console.cloud.google.com/google/maps-apis/credentials and click **Create credentials** > **API key**.
2. Edit the key. Under **API restrictions**, select **Restrict key** and allow only **Geocoding API** and **Maps Static API**.
3. Don't add HTTP referrer restrictions, because the server also calls the Geocoding API.
4. Copy the key. You'll use it for the `maps.api.key` setting. It's **mandatory**: startup fails without it.

### 5.2 Strava API application (required)

1. Log in to Strava and open **https://www.strava.com/settings/api**.
2. Fill in the form:

   | Field                             | What to enter                                                                                                                                               |
   | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | Application Name                  | Anything, for example `My Strautomator`. Don't use "Strava" in the name.                                                                                    |
   | Category                          | `Other` or `Data Importer`                                                                                                                                  |
   | Club                              | Leave empty                                                                                                                                                 |
   | Website                           | Your `app.url`, for example `https://strautomator.example.com`                                                                                              |
   | Application Description           | Anything                                                                                                                                                    |
   | **Authorization Callback Domain** | **Only the host name** of your `app.url`, with no scheme, path or port. For example `strautomator.example.com`, `abc-def.trycloudflare.com` or `localhost`. |

3. Accept the terms and create the app. Strava then asks you to upload an icon. Any square image works.
4. Copy the **Client ID** and **Client Secret**. You'll use them for `strava.api.clientId` and `strava.api.clientSecret`.

Good to know:

- New Strava apps are in **single-player mode**: only the athlete who owns the app can connect. That's fine for personal use. To let friends log in, submit the app for review from the same page.
- Each Strava app can have **only one webhook subscription**. Strautomator creates and cancels it automatically. **Use a separate Strava app for each instance you run**, for example one for local and one for the VPS. Otherwise the instances keep replacing each other's webhook.
- Strava's official walkthrough, with screenshots: https://developers.strava.com/docs/getting-started/. Webhook docs: https://developers.strava.com/docs/webhooks/.

## 6. Register on optional services

All of these services are optional. **Many of them stop the app at startup if they're enabled but their keys are missing**, so you have two choices for each one:

- Register with the service and set its keys, or
- disable it with `"<module>": {"disabled": true}`, as shown in [section 7](#7-create-your-settings-files).

| Service                         | Used for                                                        | Sign-up URL                                                     | Settings keys                                                                       | Startup check?          |
| ------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------- |
| **Open-Meteo**                  | Weather (default provider)                                      | No sign-up needed                                               | none                                                                                | No                      |
| WeatherAPI                      | Weather                                                         | https://www.weatherapi.com/signup.aspx                          | `weather.weatherapi.secret`                                                         | No (logs an error)      |
| Tomorrow.io                     | Weather                                                         | https://app.tomorrow.io/development/keys                        | `weather.tomorrow.secret`                                                           | No (logs an error)      |
| OpenWeatherMap                  | Weather (One Call 3.0 needs a subscription with a card on file) | https://home.openweathermap.org/users/sign_up                   | `weather.openweathermap.secret`                                                     | No (logs an error)      |
| Visual Crossing                 | Weather                                                         | https://www.visualcrossing.com/sign-up                          | `weather.visualcrossing.secret`                                                     | No (logs an error)      |
| LocationIQ                      | Extra geocoding provider                                        | https://locationiq.com/register                                 | `locationiq.token`                                                                  | No (logs a warning)     |
| Amazon SES (or any SMTP server) | Emails                                                          | https://docs.aws.amazon.com/ses/latest/dg/smtp-credentials.html | `mailer.from`, `mailer.smtp.host`, `mailer.smtp.auth.user`, `mailer.smtp.auth.pass` | No (emails are skipped) |
| OpenRouter                      | AI-generated names and descriptions                             | https://openrouter.ai/settings/keys                             | `openrouter.api.key`                                                                | No (logs an error)      |
| Gemini (Vertex AI)              | AI provider                                                     | Uses your GCP project (enable Vertex AI)                        | `gemini.location`                                                                   | No                      |
| GitHub                          | Changelog and GitHub Sponsors                                   | https://github.com/settings/personal-access-tokens              | `github.api.token`, `github.api.urlToken`                                           | No                      |
| **Spotify**                     | Music tags in activities                                        | https://developer.spotify.com/dashboard                         | `spotify.api.clientId`, `spotify.api.clientSecret`                                  | **Yes**                 |
| **Last.fm**                     | Music tags in activities                                        | https://www.last.fm/api/account/create                          | `lastfm.api.key`, `lastfm.api.secret`                                               | **Yes**                 |
| **Wahoo**                       | Import FIT files from Wahoo                                     | https://developers.wahooligan.com/                              | `wahoo.api.clientId`, `clientSecret`, `urlToken`, `webhookToken`                    | **Yes**                 |
| Garmin                          | Import FIT files from Garmin (business approval required)       | https://developer.garmin.com/gc-developer-program/              | `garmin.api.clientId`, `clientSecret`, `urlToken`                                   | No (logs an error)      |
| **PayPal**                      | PRO subscriptions                                               | https://developer.paypal.com/dashboard/applications/sandbox     | `paypal.api.clientId`, `paypal.api.clientSecret`                                    | **Yes**                 |
| **Paddle**                      | PRO subscriptions                                               | https://sandbox-vendors.paddle.com/                             | `paddle.api.key`, `paddle.webhookId`                                                | **Yes**                 |

If you enable an OAuth-based integration, register these callback URLs with the provider. Replace `https://strautomator.example.com/` with your `app.url`:

- Spotify: `https://strautomator.example.com/api/spotify/auth/callback`
- Wahoo: `https://strautomator.example.com/api/wahoo/auth/callback`
- Garmin: `https://strautomator.example.com/api/garmin/auth/callback`

> On a personal instance you probably don't need PayPal or Paddle. To give yourself PRO features without payments, set your user's `isPro` field to `true` directly in Firestore (collection `users-dev` in development, `users` in production).

## 7. Create your settings files

Strautomator uses [SetMeUp](https://github.com/igoramadas/setmeup) for settings. The files support `//` comments. Files are loaded in this order, and later files override earlier ones:

1. `core/settings.json`: defaults, targeting the official production site
2. `core/settings.<NODE_ENV>.json`, for example `settings.development.json`
3. `web/settings.json` and `web/settings.<NODE_ENV>.json`, if they exist
4. **`web/settings.secret.json`**: your credentials and secrets (git-ignored)
5. **Environment variables** with the `SMU_` prefix, where each `_` separates a level. For example, `SMU_gcp_projectId` sets `gcp.projectId`, and `SMU_strava_api_clientSecret` sets `strava.api.clientSecret`.
6. **`web/settings.local.json`**: loaded **only in development**, for non-sensitive local overrides (git-ignored)

> **Important:**
>
> - `gcp.projectId` and `app.url` are validated **before** `settings.local.json` is loaded, so put them in `settings.secret.json` or in environment variables.
> - In production, `settings.local.json` is **never loaded**. Put everything in `settings.secret.json` or in environment variables.

### 7.1 Generate your secret tokens

Several settings need random values. Generate them like this:

```sh
openssl rand -hex 16   # 32 chars: use for database.crypto.key and cookie.secret
openssl rand -hex 8    # 16 chars: use for database.crypto.iv
openssl rand -hex 12   # alphanumeric: use for strava.api.urlToken and strava.api.verifyToken
```

- `database.crypto.key` must be **exactly 32 characters** and `database.crypto.iv` **exactly 16 characters**, because they're used as AES-256-CBC key and IV. The app uses them to encrypt stored OAuth tokens. **Keep them forever**: if you change them later, every stored token becomes unreadable and all users have to log in again.
- URL tokens become part of the webhook URLs, so use only letters and numbers.

### 7.2 `web/settings.secret.json`

Start from the sample:

```sh
cd ~/strautomator/web
cp settings.secret.json.sample settings.secret.json
```

Then replace its contents with the **minimal working configuration** below. It enables only the required services and disables all the optional modules, including the ones that would otherwise stop startup:

```jsonc
{
  "app": {
    // Your public URL, including the trailing slash!
    "url": "https://strautomator.example.com/"
  },
  "api": {
    // Keep true when behind Cloudflare (tunnel or proxied DNS). Set to false otherwise.
    "requireCloudflare": true
  },
  "cookie": {
    "secret": "REPLACE-WITH-openssl-rand-hex-16"
  },
  "database": {
    "crypto": {
      "key": "REPLACE-WITH-32-CHARACTERS-KEY!!",
      "iv": "REPLACE-16-CHARS"
    }
  },
  "gcp": {
    "projectId": "my-strautomator"
  },
  "maps": {
    "api": {
      "key": "YOUR-GOOGLE-MAPS-API-KEY"
    }
  },
  "strava": {
    "api": {
      "clientId": "12345",
      "clientSecret": "your-strava-client-secret",
      "urlToken": "REPLACEalnumToken1",
      "verifyToken": "REPLACEalnumToken2"
    }
  },
  // Bucket names are GLOBAL across all of Google Cloud. The defaults are already taken
  // by strautomator.com, so you MUST use your own unique names, in every environment
  // (development mode only renames the calendar and gdpr buckets).
  "storage": {
    "cname": false,
    "buckets": {
      "ai": {"name": "my-strautomator-ai"},
      "cache": {"name": "my-strautomator-cache"},
      "calendar": {"name": "my-strautomator-calendar"},
      "gdpr": {"name": "my-strautomator-gdpr"}
    }
  },
  // Skip the affiliate links server (strautomator.com only).
  "affiliates": {
    "server": {"url": null}
  },
  // Disable optional modules that stop startup when their keys are missing.
  // Remove a line once you have configured that service.
  "paypal": {"disabled": true},
  "paddlewrapper": {"disabled": true},
  "spotify": {"disabled": true},
  "lastfm": {"disabled": true},
  "wahoo": {"disabled": true},
  // Optional modules that don't stop startup but log errors without keys.
  "garmin": {"disabled": true},
  "mailer": {"disabled": true},
  "openrouter": {"disabled": true},
  "chatbase": {"disabled": true},
  "weather": {
    "weatherapi": {"disabled": true},
    "tomorrow": {"disabled": true},
    "openweathermap": {"disabled": true},
    "visualcrossing": {"disabled": true}
  }
}
```

> **Note on Paddle:** to disable Paddle, use the key **`paddlewrapper`**, not `paddle`. A module's `disabled` flag is looked up by its class name in lowercase, and the Paddle module class is `PaddleWrapper`. Its API keys still go under `paddle.api.*` (`paddle.api.key` and `paddle.webhookId` are both mandatory).

> **Known cosmetic issue:** with `affiliates.server.url` set to `null`, GearWear notification emails contain a broken affiliate link. Nothing else is affected.

To enable a service later, remove its `disabled` line and add its keys. For example, for email through Amazon SES:

```jsonc
"mailer": {
    "from": "strautomator@example.com",
    "smtp": {
        "host": "email-smtp.eu-west-1.amazonaws.com",
        "auth": {"user": "SES-SMTP-USER", "pass": "SES-SMTP-PASS"}
    }
}
```

`settings.secret.json.sample` shows where some of the other services' keys go, but it isn't exhaustive (it's missing, for example, the Wahoo, Garmin, Last.fm and Paddle keys) and it still lists the deprecated `musixmatch` key.

### 7.3 `web/settings.local.json` (optional, development only)

Use this file for non-sensitive local tweaks:

```jsonc
{
  "app": {
    // Set to false if you run the tunnel yourself or don't use Cloudflare.
    "tunnel": true,
    // Verbose debug logging.
    "debug": false
  },
  "strava": {
    // true = don't write activity changes back to Strava, they're logged to the console instead. Great for testing recipes. (The FTP auto-update still writes.)
    "testMode": false
  }
}
```

### 7.4 (Optional) Encrypt `settings.secret.json`

The file stays in plain text by default. To encrypt it:

```sh
export SMU_CRYPTO_KEY="some-long-random-string"   # keep this safe, and set it wherever the app runs
npx setmeup encrypt ./settings.secret.json          # use `npx setmeup decrypt ./settings.secret.json` to edit it again
```

The app decrypts the file automatically at startup. If you don't set `SMU_CRYPTO_KEY`, SetMeUp uses **this machine's ID** as the key, and the encrypted file won't work on any other machine.

## 8. Run it locally

```sh
cd ~/strautomator/web
make run
```

`make run` does the following:

1. Copies `../core/lib` and `../core/settings*.json` into `node_modules/strautomator-core`, so your local core changes are used.
2. Starts the Nuxt dev server (`npm run dev`) on **port 3000**, with the scheduled jobs running in the same process. Both the frontend (`app/`) and the Nitro server (`server/`) reload automatically when you change their sources.
3. If `app.tunnel` is `true`, opens the Cloudflare tunnel.

The first page load takes a few seconds, because Nuxt builds the frontend on demand. Watch the logs for these messages:

```
Database.init Default connection Collections suffixed with "-dev"
Storage.init Created bucket: my-strautomator-calendar
Strava.createWebhook ID 123456 https://strautomator.example.com/api/strava/webhook/...
```

Then:

1. Open your `app.url` in the browser.
2. Click **Connect with Strava** and authorize the app.
3. You should land on the dashboard. 🎉
4. Create a test automation, then upload or edit an activity on Strava. It should be processed within seconds. Set `strava.testMode` to `true` if you don't want activity changes written back to Strava yet.

**Firestore indexes:** some queries need composite indexes. The first time one of these queries runs, the logs show a `FAILED_PRECONDITION: The query requires an index` error with a link. Open the link, click **Create index**, and wait a few minutes. You only need to do this once per query.

## 9. Run it on a VPS (production mode)

Development mode is fine for a single user on a home server. For an always-on VPS, run the app in production mode.

### 9.1 Differences in production

|                              | Development                                     | Production                                                                               |
| ---------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `NODE_ENV`                   | `development`                                   | `production`                                                                             |
| Default port                 | 3000                                            | 8080 (HTTP), or 8443 when `strautomator.cert` and `strautomator.key` are in the app root |
| `settings.local.json`        | loaded                                          | **ignored**                                                                              |
| GCP credentials              | defaults to `~/gcp-strautomator.json`           | **you must set** `GOOGLE_APPLICATION_CREDENTIALS`                                        |
| `database.crypto.key` / `iv` | dev defaults exist                              | **you must set them**                                                                    |
| Collection suffix            | `-dev`                                          | none                                                                                     |
| Scheduled jobs               | run in the app process                          | **not run**, see [Scheduled jobs](#scheduled-jobs)                                       |
| Frontend                     | built on the fly                                | must be pre-built with `npm run build`                                                   |
| Tunnel                       | started automatically if `app.tunnel` is `true` | usually a separate `cloudflared` service, but `app.tunnel` works here too                |

The `PORT` environment variable overrides the port. HTTPS can also be enabled by passing the certificate and key contents via the `NITRO_SSL_CERT` and `NITRO_SSL_KEY` environment variables.

### 9.2 Build and start

```sh
cd ~/strautomator/web
npm install
npm run build                  # build the Nuxt app (frontend + server) into ./.output
```

```sh
export NODE_ENV=production
export GOOGLE_APPLICATION_CREDENTIALS=/home/strautomator/gcp-strautomator.json
npm start
```

> **The API URL is resolved at runtime**, from `app.url` in your settings (or the `SMU_app_url` environment variable, which sets the same thing). You don't need it when building the frontend, and changing it later requires no rebuild.

### 9.3 Keep it running with systemd

Create `/etc/systemd/system/strautomator.service`:

```ini
[Unit]
Description=Strautomator Web
After=network-online.target

[Service]
User=strautomator
WorkingDirectory=/home/strautomator/strautomator/web
Environment=NODE_ENV=production
Environment=GOOGLE_APPLICATION_CREDENTIALS=/home/strautomator/gcp-strautomator.json
# The app URL comes from app.url in settings.secret.json. Alternatively:
# Environment=SMU_app_url=https://strautomator.example.com/
# Optional: Environment=SMU_CRYPTO_KEY=... if settings.secret.json is encrypted
ExecStart=/usr/bin/npm start
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now strautomator
journalctl -u strautomator -f
```

For the tunnel, point the `ingress` in `config.yml` to `http://localhost:8080`, then install cloudflared as a service with `sudo cloudflared service install`. See the [Cloudflare docs](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/) for details.

### 9.4 Docker (alternative)

```sh
docker build -t strautomator-web .
docker run -d --name strautomator -p 8080:8080 \
    -e GOOGLE_APPLICATION_CREDENTIALS=/secrets/gcp.json \
    -v ~/gcp-strautomator.json:/secrets/gcp.json:ro \
    -v "$PWD/settings.secret.json":/app/settings.secret.json:ro \
    strautomator-web
```

The app URL comes from `app.url` in `settings.secret.json` (or pass it as `-e SMU_app_url=...`). The Docker image installs `strautomator-core` from GitHub, **not** from your local `../core` folder. The Makefile's `docker-build` target builds for `linux/arm64`. Use plain `docker build` to build for your own architecture.

### Scheduled jobs

Development mode runs several jobs inside the app: delayed activity processing (about every 2 minutes), calendar regeneration (about every 3 minutes), plus GearWear and cache cleanup once at startup. They only run when the `STRAUTOMATOR_CRON` environment variable is set, which the `npm` scripts behind `make run` do for you. **Production mode runs none of them.** The official site runs them as Cloud Run jobs from [strautomator/functions](https://github.com/strautomator/functions). On a VPS you have two options:

- Deploy the functions repo on your own infrastructure. Or,
- at minimum, process delayed activities on a schedule with a cron entry. The request must go through your public Cloudflare URL, so it gets past `requireCloudflare`:
  ```cron
  */5 * * * * curl -fsS "https://strautomator.example.com/api/strava/webhook/<strava.api.urlToken>/process-activity-queue" > /dev/null
  ```

## 10. Troubleshooting

To see more detail on any problem, set `"app": {"debug": true}` in `settings.local.json` (development) or `SMU_app_debug=true` (production).

### Startup fails immediately

| Log message                                                                                | Cause                                                 | Fix                                                                                                                                                |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Missing the mandatory gcp.projectId setting` / `app.url setting`                          | Setting not set, or set only in `settings.local.json` | Put it in `settings.secret.json` or set `SMU_gcp_projectId` / `SMU_app_url`.                                                                       |
| `Failed to load settings, will exit` + `Unexpected token`                                  | Invalid JSON in a settings file                       | Check for trailing commas and missing quotes. `//` comments are allowed.                                                                           |
| `Missing the mandatory paypal.api.clientId setting`                                        | PayPal enabled without keys                           | Add `"paypal": {"disabled": true}`.                                                                                                                |
| `Missing the mandatory paddle.api.key setting` (or `paddle.webhookId`)                     | Paddle enabled without keys                           | Add `"paddlewrapper": {"disabled": true}`. **`paddle.disabled` doesn't work.**                                                                     |
| `Missing the spotify/lastfm/wahoo... setting` + `Failed to start a core module, will exit` | Optional module enabled without keys                  | Add `"<module>": {"disabled": true}`, or configure it. (Garmin and the Strava URL tokens only log an error, they don't stop the app.)              |
| `Missing the mandatory maps.api.key setting`                                               | No Google Maps key                                    | Create one ([5.1 e](#51-google-cloud-platform-required)).                                                                                          |
| `Missing the mandatory database.crypto.key setting` (production)                           | No dev defaults in production                         | Set `database.crypto.key` (32 chars) and `iv` (16 chars). Only the key is checked at startup; a bad `iv` surfaces later, on first encrypt/decrypt. |
| `Invalid key length` / `Invalid initialization vector` (Node crypto errors)                | Wrong crypto key or IV length                         | The key must be exactly 32 characters and the IV exactly 16.                                                                                       |
| `Could not load the default credentials` / `ENOENT ... gcp-strautomator.json`              | GCP key file not found                                | Save it as `~/gcp-strautomator.json` or set `GOOGLE_APPLICATION_CREDENTIALS` to its absolute path.                                                 |
| `Storage.init` + `403 ... does not have storage.buckets.get access`                        | Bucket name owned by someone else (the defaults are!) | Use your own unique bucket names ([7.2](#72-websettingssecretjson)).                                                                               |
| `Storage.init` + `requires domain ownership verification`                                  | Bucket name contains dots, like a domain              | Use names without dots and set `storage.cname` to `false`.                                                                                         |
| `Storage.init` + `Permission 'storage.buckets.create' denied`                              | Service account is missing a role                     | Grant **Storage Admin**, or create the buckets manually.                                                                                           |
| `EADDRINUSE :::3000`                                                                       | Port already in use                                   | Stop the other process, or set `PORT`.                                                                                                             |
| `Cannot find module 'strautomator-core'` or `.../lib/index.js`                             | Core not installed or not compiled                    | Run `npm install` in `web`, and `make build` in `core`.                                                                                            |

### Database errors

| Log message                                              | Cause                                                    | Fix                                                                                                                                 |
| -------------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `5 NOT_FOUND` on any query                               | Firestore database missing, or created in Datastore mode | Create the `(default)` database in **Native** mode.                                                                                 |
| `7 PERMISSION_DENIED`                                    | API disabled, or service account missing a role          | Enable the Cloud Firestore API and grant **Cloud Datastore User**. Check that `gcp.projectId` matches the project in your key file. |
| `9 FAILED_PRECONDITION: The query requires an index`     | Missing composite index                                  | Open the link in the log and create the index.                                                                                      |
| Users can't log in after you changed `database.crypto.*` | Stored tokens are encrypted with the old key             | Restore the old key and IV, or delete the affected users and log in again.                                                          |

### Login and website errors

| Symptom                                                                               | Cause                                                                                                               | Fix                                                                                                    |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Strava shows `{"field":"redirect_uri","code":"invalid"}`                              | Authorization Callback Domain doesn't match `app.url`                                                               | Set it to the **host name only** of `app.url`, for example `strautomator.example.com`.                 |
| `Access denied` (401) on login or any `/api/` call; logs show `Missing CF-Ray header` | `api.requireCloudflare` is `true` but the traffic doesn't come through Cloudflare (localhost, direct IP, own proxy) | Browse through the Cloudflare URL, or set `"api": {"requireCloudflare": false}`.                       |
| Login loops back to the home page, or the session is lost                             | You're browsing a different URL than `app.url` (for example `localhost` instead of the tunnel URL)                  | Always use the exact `app.url`.                                                                        |
| Broken URLs like `https://example.comapi/...`                                         | `app.url` has no trailing slash                                                                                     | Add the trailing `/`.                                                                                  |
| Frontend calls strautomator.com or the wrong host (production)                        | `app.url` is missing or wrong at runtime                                                                            | Set `app.url` in `settings.secret.json` (or the `SMU_app_url` env var) and restart. No rebuild needed. |
| Only you can log in; friends get an error from Strava                                 | The Strava app is in single-player mode                                                                             | Submit the app for review on https://www.strava.com/settings/api.                                      |
| Maps or locations don't show                                                          | Maps API key restricted incorrectly, or APIs not enabled                                                            | Enable **Geocoding API** and **Maps Static API**, and don't use referrer restrictions.                 |

### Activities are not processed

| Symptom                                                                                   | Cause                                                                   | Fix                                                                                                                                          |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `Could not setup the Strava webhook` + Strava reports the callback URL doesn't return 200 | Strava can't reach your URL                                             | Check that `https://<your-url>/api/strava/webhook/<urlToken>` is publicly reachable and that the tunnel is running. It can't be `localhost`. |
| `Missing the strava.api.urlToken setting` (production)                                    | Strava URL tokens are only pre-set in development                       | Set `strava.api.urlToken` and `strava.api.verifyToken`. The app logs the error and keeps running, but webhooks can't work.                   |
| Webhook works, then stops after you start another instance                                | Both instances use the same Strava app and replace each other's webhook | Use one Strava app per instance. A development instance also **cancels** its webhook when it shuts down.                                     |
| Activities are processed but nothing changes on Strava                                    | `strava.testMode` is `true`                                             | Set it to `false`.                                                                                                                           |
| Some activities are only processed hours later, or never (production)                     | Delayed queue needs the scheduled jobs                                  | See [Scheduled jobs](#scheduled-jobs).                                                                                                       |
| `Rate limited` / HTTP 429 from Strava                                                     | Strava API limits for your app                                          | Wait for the limit window to reset. Batch-processing large date ranges uses a lot of requests.                                               |

### Tunnel errors

| Log message                                    | Cause                                                                     | Fix                                                                                                         |
| ---------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `spawn ./tunnel ENOENT`                        | The `tunnel` script is missing (not running from the web repo root?)      | Run the app from the web repo root, or set `app.tunnel` to `false`.                                         |
| `Tunnel Closed with code 127`                  | `cloudflared` is not installed or not in the `PATH`                       | Install it, or set `app.tunnel` to `false`.                                                                 |
| `Tunnel Closed with code 1`                    | `.cloudflared/config.yml` or `credentials.json` is missing or wrong       | Redo [Option A](#option-a-named-cloudflare-tunnel-recommended), or run `./tunnel` by hand to see the error. |
| Cloudflare error `1033` / `502` in the browser | Tunnel is up but the app isn't running, or it's listening on another port | Check that the `ingress` port matches the app port (3000 in development, 8080 in production).               |

## 11. Updating

```sh
cd ~/strautomator/core && git pull && npm install && make build
cd ~/strautomator/web  && git pull && npm install
```

Then restart the app (`make run`, or `sudo systemctl restart strautomator`). In production, also rerun the build commands from [9.2](#92-build-and-start).

After updating, compare your settings against `settings.secret.json.sample` and `core/settings.json`, because new optional modules may need to be disabled or configured.
