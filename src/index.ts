// Strautomator Core

// Node env defaults to development.
if (!process.env.NODE_ENV) {
    process.env.NODE_ENV = "development"
}

// Logs to the console by default.
import logger = require("anyhow")
logger.setup("console")
logger.setOptions({
    appName: "Strautomator",
    timestamp: false,
    levelOnConsole: true,
    preprocessors: ["friendlyErrors", "maskSecrets"]
})

// Defaults to gcp-strautomator.json on home directory if no credentials were set for gcloud.
if (process.env.NODE_ENV != "production" && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const homedir = require("os").homedir()
    const credPath = `${homedir}/gcp-strautomator.json`
    process.env.GOOGLE_APPLICATION_CREDENTIALS = credPath

    logger.setOptions({timestamp: true})
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

    logger.setOptions({levelOnConsole: false})
    logger.info("Strautomator.startup", "Switching to JSON logging now")
    logger.setup(gcloudLogging)
}

// Init settings.
import setmeup = require("setmeup")
setmeup.readOnly = true

// Init in-memory cache.
import cache = require("bitecache")

// Load Core modules.
import {Database} from "./database"
export const database: Database = Database.Instance
import {Storage} from "./storage"
export const storage: Storage = Storage.Instance
import {Mailer} from "./mailer"
export const mailer: Mailer = Mailer.Instance
import {GitHub} from "./github"
export const github: GitHub = GitHub.Instance
import {Maps} from "./maps"
export const maps: Maps = Maps.Instance
import {PayPal} from "./paypal"
export const paypal: PayPal = PayPal.Instance
import {Strava} from "./strava"
export const strava: Strava = Strava.Instance
import {Komoot} from "./komoot"
export const komoot: Komoot = Komoot.Instance
import {Spotify} from "./spotify"
export const spotify: Spotify = Spotify.Instance
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
import {GDPR} from "./gdpr"
export const gdpr: GDPR = GDPR.Instance
import {Beta} from "./beta"
export const beta: Beta = Beta.Instance

// Export event manager.
import {EventManager} from "./eventmanager"
export const events: EventManager = EventManager.Instance

// Export types.
export * from "./gearwear/types"
export * from "./recipes/types"
export * from "./strava/types"
export * from "./komoot/types"
export * from "./spotify/types"
export * from "./users/types"
export * from "./calendar/types"
export * from "./notifications/types"
export * from "./announcements/types"
export * from "./github/types"
export * from "./paypal/types"
export * from "./weather/types"
export * from "./fortune"

// Import the custom dayjs implementation.
import dayjs from "./dayjs"

// Flag if the server is shutting down.
let terminating = false

// Startup script.
export const startup = async (quickStart?: boolean) => {
    logger.info("Strautomator.startup", `PID ${process.pid}`)

    // Set it to gracefully shutdown.
    process.on("SIGINT", shutdown)
    process.on("SIGTERM", shutdown)

    let settings: any

    try {
        setmeup.load([`${__dirname}/../settings.json`, `${__dirname}/../settings.${process.env.NODE_ENV}.json`])
        setmeup.load()
        setmeup.loadFromEnv()

        // Running locally on dev? Load local-only settings.
        if (process.env.NODE_ENV == "development") {
            setmeup.load("settings.local.json")
        }

        settings = setmeup.settings

        // Beta deployment?
        if (settings.beta.enabled) {
            logger.info("Strautomator.startup", "BETA DEPLOYMENT")
        }

        // Check basic settings.
        if (!settings.gcp.projectId) {
            throw new Error("Missing the mandatory gcp.projectId setting")
        }
        if (!settings.app.url) {
            throw new Error("Missing the mandatory app.url setting")
        }

        // Storage client must be initiated before everything else.
        if (quickStart) {
            storage.init(quickStart)
        } else {
            await storage.init()
        }

        // Get extra settings from Google Cloud Storage? To do so you must set the correct
        // bucket and filename on the settings, or via environment variables.
        if (settings.gcp.downloadSettings.bucket) {
            const path = require("path")
            const downloadSettings = settings.gcp.downloadSettings
            const targetFile = path.resolve(path.dirname(require.main.filename), "settings.from-gcp.json")
            const loadOptions = {crypto: true}

            try {
                await storage.downloadFile(downloadSettings.bucket, downloadSettings.filename, targetFile)
                setmeup.load(targetFile, loadOptions)

                // Beta deployment? Load the beta settings.
                if (settings.beta.enabled) {
                    const targetBetaFile = path.resolve(path.dirname(require.main.filename), "settings.from-gcp-beta.json")
                    await storage.downloadFile(downloadSettings.bucket, downloadSettings.betaFilename, targetBetaFile)
                    setmeup.load(targetBetaFile, loadOptions)
                }
            } catch (ex) {
                logger.error("Strautomator.startup", `Could not download ${downloadSettings.filename} from GCP bucket ${downloadSettings.bucket}`, ex)
            }
        }
    } catch (ex) {
        logger.error("Strautomator.startup", ex, "Failed to load settings, will exit")
        return process.exit(1)
    }

    // Start the database first.
    await database.init()

    // Try starting individual modules now.
    for (let coreModule of [github, mailer, maps, paypal, strava, komoot, spotify, users, recipes, twitter, weather, gearwear, notifications, announcements, calendar, faq, gdpr]) {
        try {
            const modSettings = settings[coreModule.constructor.name.toLowerCase()]

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

    // Running on a beta environment?
    if (settings.beta.enabled) {
        await beta.init()
    }

    // Running locally? Setup the necessary cron jobs which are
    // otherwise defined as Cloud Functions in production.
    if (process.env.NODE_ENV == "development" && process.env.STRAUTOMATOR_CRON) {
        logger.warn("Strautomator.startup", "Setting up cron jobs directly")

        // Process queued activities every 5 minutes.
        const processQueuedActivities = async () => {
            await strava.activityProcessing.processQueuedActivities()
        }
        setInterval(processQueuedActivities, 1000 * 60 * 5)

        // Cleanup old queued activities every hour.
        const cleanupQueuedActivities = async () => {
            const beforeDate = dayjs().subtract(settings.strava.maxQueueAge, "seconds").toDate()
            const activities = await strava.activityProcessing.getQueuedActivities(beforeDate)

            for (let activity of activities) {
                await strava.activityProcessing.deleteQueuedActivity(activity)
            }
        }
        setInterval(cleanupQueuedActivities, 1000 * 60 * 60)

        // Cleanup cached Strava responses, notifications and GDPR archives right away.
        strava.cleanupCache()
        notifications.cleanup()
        gdpr.clearArchives()

        // Process GearWear configurations right away.
        gearwear.processRecentActivities()
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
