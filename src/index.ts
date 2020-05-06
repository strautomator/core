// Strautomator Core

// Logging module.
import logger = require("anyhow")
logger.setup("console")
logger.levelOnConsole = true

// Node env defaults to development.
if (!process.env.NODE_ENV) {
    process.env.NODE_ENV = "development"
}

// Defaults to gcp-credentials.json on home directory if no credentials were set for gcloud.
if (process.env.NODE_ENV != "production" && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const homedir = require("os").homedir()
    const credPath = `${homedir}/gcp-credentials.json`
    process.env.GOOGLE_APPLICATION_CREDENTIALS = credPath
    logger.warn("Strautomator.startup", `GOOGLE_APPLICATION_CREDENTIALS defaulting to ${credPath}`)
}

// Init settings.
import setmeup = require("setmeup")

// Init in-memory cache.
import cache = require("bitecache")

// Load Core modules.
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

// Flag if the server is shutting down.
let terminating = false

// Startup script.
export const startup = async (dryRun?: boolean) => {
    logger.info("Strautomator.startup", `PID ${process.pid}`)

    // Set it to gracefully shutdown.
    process.on("SIGINT", shutdown)
    process.on("SIGTERM", shutdown)

    try {
        const settings = setmeup.settings

        // Load core settings, them module settings, then from environment variables.
        setmeup.load([`${__dirname}/../settings.json`, `${__dirname}/../settings.${process.env.NODE_ENV}.json`])
        setmeup.load()
        setmeup.loadFromEnv()

        // Check basic settings.
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

                // Download settings from GCS.
                const storage = new Storage(storageOptions)
                const file = storage.bucket(downloadSettings.bucket).file(downloadSettings.filename)
                await file.download({destination: "./settings.from-gcp.json"})

                // Load downloaded settings, assuming they're encrypted.
                const loadOptions = {crypto: true, destroy: true}
                setmeup.load("./settings.from-gcp.json", loadOptions)
            } catch (ex) {
                logger.error("Strautomator.startup", `Could not download ${downloadSettings.filename} from GCP bucket ${downloadSettings.bucket}`, ex)
            }
        }
    } catch (ex) {
        if (dryRun === false) {
            logger.error("Strautomator.startup", "Failed to load settings", ex)
        } else {
            logger.error("Strautomator.startup", "Failed to load settings, will exit...")
            return process.exit(1)
        }
    }

    // Try starting individual modules now.
    for (let coreModule of [database, mailer, maps, paypal, strava, users, weather]) {
        try {
            await coreModule.init()
        } catch (ex) {
            if (dryRun === false) {
                logger.debug("Strautomator.startup", "Failed to start a core module", ex)
            } else {
                logger.error("Strautomator.startup", "Failed to start a core module, will exit...")
                return process.exit(1)
            }
        }
    }
}

// Shutdown script.
export const shutdown = async (code) => {
    if (terminating) return
    terminating = true

    // Code defaults to 0.
    if (!code) code = 0

    logger.warn("Strautomator.shutdown", `Code ${code}`, "Terminating the service now...")

    try {
        cache.clear()

        // Remove Strava webhook on development.
        if (process.env.NODE_ENV == "development") {
            await strava.webhooks.cancelWebhook()
        }
    } catch (ex) {
        logger.warn("Strautomator.shutdown", ex)
    }

    logger.warn("Strautomator.shutdown", "Service terminated!")
    process.exit()
}
