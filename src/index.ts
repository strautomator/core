// Strautomator Core

// Logging module.
import logger = require("anyhow")
logger.setup("console")
logger.levelOnConsole = true
logger.info("Strautomator.startup", `PID ${process.pid}`)

// Defaults to gcp-credentials.json if no credentials were set for gcloud.
if (process.env.NODE_ENV != "production" && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const homedir = require("os").homedir()
    const credPath = `${homedir}/gcp-credentials.json`
    process.env.GOOGLE_APPLICATION_CREDENTIALS = credPath
    logger.warn("Strautomator.startup", `GOOGLE_APPLICATION_CREDENTIALS defaulting to ${credPath}`)
}

// Settings module, then core modules.
import setmeup = require("setmeup")

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

// Export useful types.
export {RecipeAction, RecipeActionType, RecipeCondition, RecipeData, RecipeOperator} from "./recipes/types"
export {UserData} from "./users/types"

// Startup script.
export const startup = async () => {
    const settings = setmeup.settings

    // Load core settings.
    setmeup.load(`${__dirname}/../settings.json`)
    setmeup.load(`${__dirname}/../settings.${process.env.NODE_ENV}.json`)

    // Load settings defined for current module (web or api).
    setmeup.load()
    setmeup.load("settings.private.json")
    setmeup.loadFromEnv("STA")

    // Specific environment variables?
    if (settings.general.envPrefix) {
        setmeup.loadFromEnv(settings.general.envPrefix)
    }

    // Try starting individual modules now.
    try {
        await database.init()
        await mailer.init()
        await maps.init()
        await strava.init()
        await weather.init()
    } catch (ex) {
        logger.error("Strautomator.startup", "Failed to start, will exit...")
        process.exit()
    }
}
