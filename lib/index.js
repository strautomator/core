"use strict";
// Strautomator Core
function __export(m) {
    for (var p in m) if (!exports.hasOwnProperty(p)) exports[p] = m[p];
}
Object.defineProperty(exports, "__esModule", { value: true });
// Logging module.
const logger = require("anyhow");
logger.setup("console");
logger.levelOnConsole = true;
logger.info("Strautomator.startup", `PID ${process.pid}`);
// Defaults to gcp-credentials.json if no credentials were set for gcloud.
if (process.env.NODE_ENV != "production" && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const homedir = require("os").homedir();
    const credPath = `${homedir}/gcp-credentials.json`;
    process.env.GOOGLE_APPLICATION_CREDENTIALS = credPath;
    logger.warn("Strautomator.startup", `GOOGLE_APPLICATION_CREDENTIALS defaulting to ${credPath}`);
}
// Settings module, then core modules.
const setmeup = require("setmeup");
const cache = require("bitecache");
const database_1 = require("./database");
exports.database = database_1.Database.Instance;
const mailer_1 = require("./mailer");
exports.mailer = mailer_1.Mailer.Instance;
const maps_1 = require("./maps");
exports.maps = maps_1.Maps.Instance;
const paypal_1 = require("./paypal");
exports.paypal = paypal_1.PayPal.Instance;
const strava_1 = require("./strava");
exports.strava = strava_1.Strava.Instance;
const weather_1 = require("./weather");
exports.weather = weather_1.Weather.Instance;
const users_1 = require("./users");
exports.users = users_1.Users.Instance;
const recipes_1 = require("./recipes");
exports.recipes = recipes_1.Recipes.Instance;
// Export types.
__export(require("./recipes/types"));
__export(require("./strava/types"));
// Startup script.
exports.startup = async () => {
    const settings = setmeup.settings;
    // Load core settings.
    setmeup.load(`${__dirname}/../settings.json`);
    setmeup.load(`${__dirname}/../settings.${process.env.NODE_ENV}.json`);
    // Load settings defined for current module (web or api).
    setmeup.load();
    setmeup.load("settings.private.json");
    setmeup.loadFromEnv("STA");
    // Specific environment variables?
    if (settings.general.envPrefix) {
        setmeup.loadFromEnv(settings.general.envPrefix);
    }
    // Try starting individual modules now.
    try {
        await exports.database.init();
        await exports.mailer.init();
        await exports.maps.init();
        await exports.strava.init();
        await exports.weather.init();
    }
    catch (ex) {
        logger.error("Strautomator.startup", "Failed to start, will exit...");
        process.exit();
    }
};
// Shutdown script.
exports.shutdown = async () => {
    logger.warn("Strautomator.shutdown", "Terminating the service now...");
    cache.clear();
};
