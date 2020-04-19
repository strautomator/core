// Strautomator Core

// Logging module.
import logger = require("anyhow")
logger.setup("console")
logger.levelOnConsole = true

// Defaults to gcp-credentials.json on home directory if no credentials were set for gcloud.
if (process.env.NODE_ENV != "production" && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const homedir = require("os").homedir()
    const credPath = `${homedir}/gcp-credentials.json`
    process.env.GOOGLE_APPLICATION_CREDENTIALS = credPath
    logger.warn("Strautomator.startup", `GOOGLE_APPLICATION_CREDENTIALS defaulting to ${credPath}`)
}

// Settings module, then core modules.
import setmeup = require("setmeup")
import cache = require("bitecache")

import {Database} from "./database"
export const database: Database = Database.Instance

import {Mailer} from "./mailer"
export const mailer: Mailer = Mailer.Instance

import {Maps} from "./maps"
export const maps: Maps = Maps.Instance

import {PayPal} from "./paypal"
export const paypal: PayPal = PayPal.Instance

import {Strava} from "./strava"
export const strava: Strava = Strava.Instance

import {Weather} from "./weather"
export const weather: Weather = Weather.Instance

import {Users} from "./users"
export const users: Users = Users.Instance

import {Recipes} from "./recipes"
export const recipes: Recipes = Recipes.Instance

// Export types.
export * from "./recipes/types"
export * from "./strava/types"
export * from "./users/types"

// Startup script.
export const startup = async () => {
    logger.info("Strautomator.startup", `PID ${process.pid}`)

    // Load settings defined at the core, and then from the app root.
    setmeup.load([`${__dirname}/../settings.json`, `${__dirname}/../settings.${process.env.NODE_ENV}.json`, `${__dirname}/../settings.secret.json`])
    setmeup.load()

    // Load settings from env.
    setmeup.loadFromEnv()

    // Check basic settings.
    const settings = setmeup.settings
    if (!settings.gcp.projectId) {
        throw new Error("Missing the mandatory gcp.projectId setting")
    }

    // Get extra settings from Google Cloud Storage? To do so you must set the correct
    // bucket and filename on the settings, or via environment variables.
    if (setmeup.settings.gcp.downloadSettings.bucket) {
        const downloadSettings = settings.gcp.downloadSettings

        try {
            const {Storage} = require("@google-cloud/storage")
            const storageOptions: any = {}

            if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
                storageOptions.keyFilename = process.env.GOOGLE_APPLICATION_CREDENTIALS
            }

            const storage = new Storage(storageOptions)
            const file = storage.bucket(downloadSettings.bucket).file(downloadSettings.filename)
            await file.download({destination: "./settings.from-gcp.json"})

            setmeup.load("./settings.from-gcp.json", {destroy: true})
        } catch (ex) {
            logger.error("Strautomator.startup", `Could not download ${downloadSettings.filename} from GCP bucket ${downloadSettings.bucket}`, ex)
            process.exit(2)
        }
    }

    // Try starting individual modules now.
    try {
        await database.init()
        await mailer.init()
        await maps.init()
        await strava.init()
        await users.init()
        await weather.init()
    } catch (ex) {
        logger.error("Strautomator.startup", "Failed to start, will exit...")
        process.exit(1)
    }
}

// Shutdown script.
export const shutdown = async () => {
    logger.warn("Strautomator.shutdown", "Terminating the service now...")
    cache.clear()
}
