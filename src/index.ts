// Strautomator Core

// Node env defaults to development.
if (!process.env.NODE_ENV) {
    process.env.NODE_ENV = "development"
}

// Logs to the console by default.
import logger = require("anyhow")
logger.appName = "Strautomator"
logger.levelOnConsole = true
logger.setup("console")

// Defaults to gcp-credentials.json on home directory if no credentials were set for gcloud.
if (process.env.NODE_ENV != "production" && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const homedir = require("os").homedir()
    const credPath = `${homedir}/gcp-credentials.json`
    process.env.GOOGLE_APPLICATION_CREDENTIALS = credPath
    logger.warn("Strautomator.startup", `GOOGLE_APPLICATION_CREDENTIALS defaulting to ${credPath}`)
}

// Check if JSON logging (for Google Cloud Logging) should be used instead of simple text.
if (process.env.NODE_ENV == "production" && process.env.JSON_LOGGING) {
    const consoleLog = (level, message) => {
        level = level.toUpperCase()
        if (level == "WARN") level = "WARNING"
        console.log(JSON.stringify({severity: level, message: message}))
    }
    const gcloudLogging = {
        name: "gcloud",
        log: consoleLog
    }

    logger.info("Strautomator.startup", "Switching to JSON logging now")
    logger.levelOnConsole = false
    logger.setup(gcloudLogging)
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
import {Twitter} from "./twitter"
export const twitter: Twitter = Twitter.Instance
import {Weather} from "./weather"
export const weather: Weather = Weather.Instance
import {Users} from "./users"
export const users: Users = Users.Instance
import {Recipes} from "./recipes"
export const recipes: Recipes = Recipes.Instance
import {GearWear} from "./gearwear"
export const gearwear: GearWear = GearWear.Instance
import {Notifications} from "./notifications"
export const notifications: Notifications = Notifications.Instance
import {Announcements} from "./announcements"
export const announcements: Announcements = Announcements.Instance
import {Calendar} from "./calendar"
export const calendar: Calendar = Calendar.Instance
import {FAQ} from "./faq"
export const faq: FAQ = FAQ.Instance

// Export event manager.
import {EventManager} from "./eventmanager"
export const events: EventManager = EventManager.Instance

// Export types.
export * from "./gearwear/types"
export * from "./recipes/types"
export * from "./strava/types"
export * from "./users/types"
export * from "./calendar/types"
export * from "./notifications/types"
export * from "./announcements/types"
export * from "./paypal/types"
export * from "./fortune"

// Flag if the server is shutting down.
let terminating = false

// Startup script.
export const startup = async (quickStart?: boolean) => {
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
        if (!settings.app.url) {
            throw new Error("Missing the mandatory app.url setting")
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
        logger.error("Strautomator.startup", ex, "Failed to load settings, will exit")
        return process.exit(1)
    }

    // Try starting individual modules now.
    for (let coreModule of [database, mailer, maps, paypal, strava, users, recipes, twitter, weather, gearwear, notifications, announcements, calendar, faq]) {
        try {
            const modSettings = setmeup.settings[coreModule.constructor.name.toLowerCase()]

            if (modSettings && modSettings.disabled) {
                logger.warn("Strautomator.startup", coreModule.constructor.name, "Module is disabled on settings")
            } else {
                if (quickStart) {
                    coreModule.init(quickStart)
                } else {
                    await coreModule.init()
                }
            }
        } catch (ex) {
            logger.error("Strautomator.startup", "Failed to start a core module, will exit...")
            return process.exit(1)
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

    logger.warn("Strautomator.shutdown", "Service terminated")
    process.exit()
}
