# Strautomator Web

This is Strautomator's web frontend and API, built with Nuxt (Vue 3 + Nitro), Vuetify and Pinia. It depends on the [Strautomator Core](https://github.com/strautomator/core) to run. Please make sure you read the docs for the Core first before proceeding with the Web setup.

## Settings

Strautomator is using the [SetMeUp](https://github.com/igoramadas/setmeup) module to handle its settings, so for detailed info please check its docs. The settings are split as follows:

- **settings.json** - settings shared by all environments, targeting production by default
- **settings.development.json** - development settings, mostly when running on your dev machine
- **settings.production.json** - production-only settings, except credentials and secrets (optional)
- **settings.secret.json** - private credentials and secrets, excluded from the GIT repo
- **settings.local.json** - private local-only settings, excluded from the GIT repo

Please note that the [Core](https://github.com/strautomator/core) also has its own collection of settings files as well. If the same setting is define on the Core and on the Web, the Web settings has the higher priority.

## Local setup

For a complete step-by-step self-hosting guide, please read [SETUP.md](SETUP.md).

### Local settings

Make a copy of the [settings.secret.json.sample](https://github.com/strautomator/web/blob/master/settings.secret.json.sample) and name it `settings.secret.json`. This is where you'll store all the credentials and sensitive keys. The file stays in plain text unless you encrypt it with `$ npx setmeup encrypt settings.secret.json` (see [SETUP.md](SETUP.md) for details).

For other non-sensitive data, you can create a `settings.local.json`. This file is kept in clear text on your local machine.

### Setting the URL

The default URL in development is `http://localhost:3000`, which should be manually set on your HOSTS file. This is fine if you only want to work on the web frontend and some of the API calls, but please note that Strava (and other 3rd party webhooks) won't be able to push data to the service using that URL. Authentication with Strava might also fail.

To properly test all APIs and webhooks from Strava and PayPal, you'll need to set `app.url` to a publicly accessible URL, on your `settings.secret.json` file or via the `$SMU_app_url` environment variable. It's recommended to use a tunnel to avoid port forwarding on your router.

If for whatever reason you want to split the Strautomator API from the frontend, you can use the `api.url` setting to specify the base path for the API. By default, it runs on the `/api/` path under the same URL set on the `app.url`.

### MCP server

The web app also hosts a remote MCP server at `/mcp` for PRO members. MCP clients (Cursor, Claude, etc.) authenticate with OAuth 2.1:

- Protected resource metadata: `/.well-known/oauth-protected-resource`
- Authorization server metadata: `/.well-known/oauth-authorization-server`
- Dynamic client registration: `/mcp/oauth/register`
- Authorization (Strava login + consent): `/mcp/oauth/authorize`
- Token + PKCE: `/mcp/oauth/token`

Users stay on Strava for identity. The MCP authorization server issues its own tokens (audience-bound to `/mcp`) and never accepts or forwards Strava access tokens. Connect from an MCP client using the server URL `https://strautomator.com/mcp`.

The frontend resolves the API URL at runtime from the `app.url` setting (or the `$SMU_app_url` environment variable, which sets the same thing), so there's no need to bake it into the Nuxt build.

### Cloudflare Tunnel

The easiest way to get the web frontend running and accessible with SSL is by using a tunnel. By default the app will try opening a tunnel with Cloudflare when running on dev, but you'll need to setup the tunnel manually first. Instructions can be found [here](https://developers.cloudflare.com/pages/how-to/preview-with-cloudflare-tunnel).

To disable the tunnel execution, set the `app.tunnel` setting to false on the `settings.local.json` file.

### Server ports

When starting up in production (`npm start`), the service will look for the `strautomator.cert` and `strautomator.key` files on the application root. If found, it will create a HTTPS server with those certificate files, otherwise it will create a regular HTTP server. The default ports:

- Development: 3000
- Production (HTTP): 8080
- Production (HTTPS): 8443

Please note that the actual port can be overwritten via the PORT environment variable.

### Running it locally

As simple as:

    $ make run

If any required settings are missing or wrongly set, you'll get alerted on the console. When running locally (NODE_ENV is development), all features dependent on scheduled functions will run at startup.

## Deployment

Strautomator is targeting GCP and can be easily deployed as a standalone VM instance, as a Cloud Run service, or to App Engine. Although you could also run it on other providers (AWS for instance), please keep in mind that the database, Cloud Firestore, runs on Google.

Also note that even thou this project is open source, you might need to adapt some settings if you want to run it in production on your own cloud environment. This includes changing the target URL (https://strautomator.com/), server IP and ports, HTMLs with references to strautomator.com, etc.

Basic deployment samples are provided:

- App Engine: [app.yaml](https://github.com/strautomator/web/blob/master/app.yaml.sample) (not tested in production).
- VM or VPS: see the systemd and Docker instructions on [SETUP.md](SETUP.md).
- Cloud Run: create a [Cloud Build trigger](https://cloud.google.com/cloud-build/docs/automating-builds/create-manage-triggers) to update your service whenever there's a new version pushed to your GIT fork.

### Scheduled functions

Please note that some features depend on scheduled functions to work. These can be found [here](https://github.com/strautomator/functions), and need to be deployed separately to your environment of choice.
