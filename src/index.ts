// Strautomator Core

// Node env defaults to development.
if (!process.env.NODE_ENV) {
    process.env.NODE_ENV = "development"
}
const nodeEnv = process.env.NODE_ENV

// Logs to the console by default.
import logger from "anyhow"
logger.setup("console")
logger.setOptions({
    appName: "Strautomator",
    timestamp: false,
    levelOnConsole: true,
    preprocessors: ["friendlyErrors", "maskSecrets"]
})

// Defaults to gcp-strautomator.json on home directory if no credentials were set for gcloud.
if (nodeEnv != "production" && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const homedir = require("os").homedir()
    const credPath = `${homedir}/gcp-strautomator.json`
    process.env.GOOGLE_APPLICATION_CREDENTIALS = credPath

    logger.setOptions({timestamp: true})
    logger.warn("Strautomator.startup", `GOOGLE_APPLICATION_CREDENTIALS defaulting to ${credPath}`)
}

// Check if JSON logging (for Google Cloud Logging) should be used instead of simple text.
if (nodeEnv == "production" && process.env.JSON_LOGGING) {
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
import cache from "bitecache"

// Load Core modules and event manager.
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
import {Routes} from "./routes"
export const routes: Routes = Routes.Instance
import {Strava} from "./strava"
export const strava: Strava = Strava.Instance
import {Komoot} from "./komoot"
export const komoot: Komoot = Komoot.Instance
import {Musixmatch} from "./musixmatch"
export const musixmatch: Musixmatch = Musixmatch.Instance
import {OpenAI} from "./openai"
export const openai: OpenAI = OpenAI.Instance
import {Garmin} from "./garmin"
export const garmin: Garmin = Garmin.Instance
import {Spotify} from "./spotify"
export const spotify: Spotify = Spotify.Instance
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
import {EventManager} from "./eventmanager"
export const events: EventManager = EventManager.Instance

// Export types and helpers.
export * from "./gearwear/types"
export * from "./recipes/types"
export * from "./recipes/fortune"
export * from "./routes/types"
export * from "./strava/types"
export * from "./komoot/types"
export * from "./garmin/types"
export * from "./spotify/types"
export * from "./users/types"
export * from "./calendar/types"
export * from "./notifications/types"
export * from "./announcements/types"
export * from "./github/types"
export * from "./paypal/types"
export * from "./weather/types"
export * as logHelper from "./loghelper"

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
        setmeup.load([`${__dirname}/../settings.json`, `${__dirname}/../settings.${nodeEnv}.json`])
        setmeup.load()
        setmeup.loadFromEnv()

        settings = setmeup.settings

        // Check basic settings.
        if (!settings.gcp.projectId) {
            throw new Error("Missing the mandatory gcp.projectId setting")
        }
        if (!settings.app.url) {
            throw new Error("Missing the mandatory app.url setting")
        }

        // Running locally on dev? Load local-only settings as the last loaded file so it overwrites everything else.
        if (nodeEnv == "development") {
            setmeup.load("settings.local.json")
        }

        // Debugging enabled?
        if (settings.app.debug) {
            logger.options.levels.push("debug")
        }

        // Beta deployment? Override the database collection suffix and other relevant settings.
        if (settings.beta.enabled) {
            logger.warn("Strautomator.startup", "BETA DEPLOYMENT")
            settings.app.url = settings.beta.url
            settings.app.title += " (Beta)"
            settings.database.collectionSuffix += settings.beta.collectionSuffix
            settings.cookie.sessionName += "beta"
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

    // Start the database before other modules.
    await database.init()

    // Helper to init a core module.
    const initModule = async (module) => {
        try {
            const modSettings = settings[module.constructor.name.toLowerCase()]

            if (modSettings?.disabled) {
                logger.warn("Strautomator.startup", module.constructor.name, "Module is disabled on settings")
            } else if (modSettings?.beta && !settings.beta.enabled) {
                logger.warn("Strautomator.startup", module.constructor.name, "Module is currently in beta, won't init in production")
            } else {
                if (quickStart) {
                    module.init(quickStart)
                } else {
                    await module.init()
                }
            }
        } catch (ex) {
            logger.error("Strautomator.startup", "Failed to start a core module, will exit...")
            return process.exit(1)
        }
    }

    // Init individual modules now. Start with the most important modules, than the rest.
    const coreModules = [github, paypal, strava, users]
    await Promise.all(coreModules.map(initModule))
    const otherModules = [announcements, calendar, faq, garmin, gearwear, gdpr, komoot, mailer, maps, musixmatch, notifications, openai, recipes, spotify, weather]
    await Promise.all(otherModules.map(initModule))

    // Running locally? Setup the necessary cron jobs which are
    // otherwise defined as Cloud Functions in production.
    if (nodeEnv == "development" && process.env.STRAUTOMATOR_CRON) {
        try {
            logger.warn("Strautomator.startup", "Setting up cron jobs directly")

            // Process queued activities every 2 minutes.
            const processQueuedActivities = async () => {
                await strava.activityProcessing.processQueuedActivities()
            }
            setInterval(processQueuedActivities, 1000 * 60 * 2)

            // Cleanup old queued activities every hour.
            const cleanupQueuedActivities = async () => {
                const beforeDate = dayjs().subtract(settings.strava.processingQueue.maxAge, "seconds").toDate()
                const activities = await strava.activityProcessing.getQueuedActivities(beforeDate)

                for (let activity of activities) {
                    await strava.activityProcessing.deleteQueuedActivity(activity)
                }
            }
            setInterval(cleanupQueuedActivities, 1000 * 60 * 60)

            // Cleanup cached Strava responses, processed activities, notifications and GDPR archives right away.
            strava.cleanupCache()
            strava.activityProcessing.deleteProcessedActivities(null, settings.strava.processedActivities.maxAgeDays)
            notifications.cleanup()
            gdpr.clearArchives()

            // Process GearWear configurations.
            gearwear.processRecentActivities()
        } catch (ex) {
            logger.error("Strautomator.startup", "Failed to setup cron jobs", ex)
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
        if (nodeEnv == "development") {
            await strava.webhooks.cancelWebhook()
        }
    } catch (ex) {
        logger.warn("Strautomator.shutdown", ex)
    }

    logger.warn("Strautomator.shutdown", "Service terminated")
    process.exit()
}
