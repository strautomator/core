// Strautomator Core: Users Utils

import {UserData} from "../users/types"
import _ from "lodash"
import logger from "anyhow"
const settings = require("setmeup").settings

/**
 * Validate user preferences, and revert invalid values to their defaults.
 * @param user User to be validated.
 */
export const validateUserPreferences = (user: Partial<UserData>): void => {
    try {
        const fields = []
        const weatherKeys = Object.keys(settings.weather)

        // Make sure numeric properties are using the expected type.
        if (!_.isNil(user.preferences.linksOn)) {
            if (isNaN(user.preferences.linksOn)) throw new Error("Invalid preference: linksOn")
            if (typeof user.preferences.linksOn != "number") {
                user.preferences.linksOn = parseInt(user.preferences.linksOn)
            }
        }
        if (!_.isNil(user.preferences.gearwearDelayDays)) {
            if (isNaN(user.preferences.gearwearDelayDays)) throw new Error("Invalid preference: gearwearDelayDays")
            if (typeof user.preferences.gearwearDelayDays != "number") {
                user.preferences.gearwearDelayDays = parseInt(user.preferences.gearwearDelayDays)
            }
        }

        // PRO only features.
        if (!user.isPro) {
            if (!_.isNil(user.preferences.linksOn) && (user.preferences.linksOn < 1 || user.preferences.linksOn > 10)) {
                fields.push(`linksOn: ${user.preferences.linksOn}`)
                user.preferences.linksOn = settings.plans.free.linksOn
            }

            if (!_.isNil(user.preferences.ftpAutoUpdate) && user.preferences.ftpAutoUpdate) {
                fields.push(`ftpAutoUpdate: ${user.preferences.ftpAutoUpdate}`)
                user.preferences.ftpAutoUpdate = false
            }
        }

        if (!_.isNil(user.preferences.gearwearDelayDays) && (user.preferences.gearwearDelayDays < 1 || user.preferences.gearwearDelayDays > 3)) {
            fields.push(`gearwearDelayDays: ${user.preferences.gearwearDelayDays}`)
            user.preferences.gearwearDelayDays = 2
        }

        if (!_.isNil(user.preferences.weatherProvider) && user.preferences.weatherProvider && !weatherKeys.includes(user.preferences.weatherProvider)) {
            fields.push(`weatherProvider: ${user.preferences.weatherProvider}`)
            user.preferences.weatherProvider = _.sample(settings.weather.defaultProviders.free)
        }

        if (!_.isNil(user.preferences.dateResetCounter) && user.preferences.dateResetCounter && !user.preferences.dateResetCounter.includes("-")) {
            fields.push(`dateResetCounter: ${user.preferences.dateResetCounter}`)
            user.preferences.dateResetCounter = false
        }

        if (fields.length > 0) {
            logger.warn("Users.validatePreferences", user.id, user.displayName, "Invalid fields reverted to default", `${fields.join(", ")}`)
        }
    } catch (ex) {
        logger.error("Users.validatePreferences", user.id, user.displayName, ex)
    }
}
