// Strautomator Core: Users Utils

import {FieldValue} from "@google-cloud/firestore"
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

        // Helper to check if preference is not set or deleted.
        const hasValue = (field: string): boolean => {
            return !_.isNil(user.preferences[field]) && user.preferences[field] != (FieldValue.delete() as any)
        }

        // Helper to reset PRO only preferences.
        const proOnlyPreference = (field: string, maxValue?: number): void => {
            if (!hasValue(user.preferences[field])) return
            const hasMaxValue = !_.isNil(maxValue)
            if ((hasMaxValue && user.preferences[field] > maxValue) || (!hasMaxValue && user.preferences[field])) {
                fields.push(`${field}: PRO only`)
                user.preferences[field] = FieldValue.delete() as any
            }
        }

        // Make sure numeric properties are using the expected type.
        if (hasValue("linksOn")) {
            if (isNaN(user.preferences.linksOn)) {
                throw new Error("Preference linksOn must be a number")
            }
            if (typeof user.preferences.linksOn != "number") {
                user.preferences.linksOn = parseInt(user.preferences.linksOn)
            }
        }
        if (hasValue("gearwearDelayDays")) {
            if (isNaN(user.preferences.gearwearDelayDays)) {
                throw new Error("Preference gearwearDelayDays must be a number")
            }
            if (typeof user.preferences.gearwearDelayDays != "number") {
                user.preferences.gearwearDelayDays = parseInt(user.preferences.gearwearDelayDays)
            }
        }

        // PRO only features.
        if (!user.isPro) {
            proOnlyPreference("linksOn", 5)
            proOnlyPreference("ftpAutoUpdate")
            proOnlyPreference("chatGptPrompt")
            proOnlyPreference("weatherProvider")
        }

        if (hasValue("weatherProvider") && user.preferences.weatherProvider && !weatherKeys.includes(user.preferences.weatherProvider)) {
            fields.push(`weatherProvider: ${user.preferences.weatherProvider}`)
            user.preferences.weatherProvider = _.sample(settings.weather.defaultProviders.free)
        }

        if (hasValue("gearwearDelayDays") && (user.preferences.gearwearDelayDays < 1 || user.preferences.gearwearDelayDays > 3)) {
            fields.push(`gearwearDelayDays: ${user.preferences.gearwearDelayDays}`)
            user.preferences.gearwearDelayDays = FieldValue.delete() as any
        }

        if (hasValue("dateResetCounter") && user.preferences.dateResetCounter && !user.preferences.dateResetCounter.includes("-")) {
            fields.push(`dateResetCounter: ${user.preferences.dateResetCounter}`)
            user.preferences.dateResetCounter = FieldValue.delete() as any
        }

        if (fields.length > 0) {
            logger.warn("Users.validatePreferences", user.id, user.displayName, `isPRO: ${user.isPro}`, "Invalid fields reverted to default", `${fields.join(", ")}`)
        }
    } catch (ex) {
        logger.error("Users.validatePreferences", user.id, user.displayName, ex)
    }
}
