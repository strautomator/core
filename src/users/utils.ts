// Strautomator Core: Users Utils

import {FieldValue} from "@google-cloud/firestore"
import {UserData} from "../users/types"
import _ from "lodash"
import logger from "anyhow"
const settings = require("setmeup").settings

// Helper to check if preference is not set or deleted.
const hasValue = (user: Partial<UserData>, field: string): boolean => {
    return !_.isNil(user.preferences[field]) && user.preferences[field] != (FieldValue.delete() as any)
}

/**
 * List of PRO-only user preferences.
 */
export const proPreferences = ["linksOn=0", "calendarTemplate", "aiProvider", "aiPrompt", "ftpAutoUpdate", "weatherProvider"]

/**
 * Helper to disable PRO only preferences for the specified user, returns the list of fields that were reset.
 * @param user The user data.
 */
export const disableProPreferences = (user: Partial<UserData>): string[] => {
    const resetFields: string[] = []

    for (let field of proPreferences) {
        const arrField = field.split("=")
        if (!hasValue(user, arrField[0])) {
            continue
        }
        if ((arrField.length > 1 && user.preferences[arrField[0]].toString() == arrField[1]) || (arrField.length == 1 && user.preferences[arrField[0]])) {
            resetFields.push(`${field}: PRO only`)
            user.preferences[field] = FieldValue.delete() as any
        }
    }

    return resetFields
}

/**
 * Validate user preferences, and revert invalid values to their defaults.
 * @param user User to be validated.
 */
export const validateUserPreferences = (user: Partial<UserData>): void => {
    try {
        const fields = []
        const weatherKeys = Object.keys(settings.weather)

        if (hasValue(user, "dateResetCounter") && user.preferences.dateResetCounter && !user.preferences.dateResetCounter.includes("-")) {
            fields.push(`dateResetCounter: ${user.preferences.dateResetCounter}`)
            user.preferences.dateResetCounter = FieldValue.delete() as any
        }

        if (hasValue(user, "gearwearDelayDays")) {
            if (isNaN(user.preferences.gearwearDelayDays)) {
                throw new Error("Preference gearwearDelayDays must be a number")
            }
            if (typeof user.preferences.gearwearDelayDays != "number") {
                user.preferences.gearwearDelayDays = parseInt(user.preferences.gearwearDelayDays)
            }
            if (user.preferences.gearwearDelayDays < 1 || user.preferences.gearwearDelayDays > 3) {
                fields.push(`gearwearDelayDays: ${user.preferences.gearwearDelayDays}`)
                user.preferences.gearwearDelayDays = FieldValue.delete() as any
            }
        }

        if (hasValue(user, "linksOn")) {
            if (isNaN(user.preferences.linksOn)) {
                throw new Error("Preference linksOn must be a number")
            }
            if (typeof user.preferences.linksOn != "number") {
                user.preferences.linksOn = parseInt(user.preferences.linksOn)
            }
        }

        if (hasValue(user, "weatherProvider") && user.preferences.weatherProvider && !weatherKeys.includes(user.preferences.weatherProvider)) {
            fields.push(`weatherProvider: ${user.preferences.weatherProvider}`)
            user.preferences.weatherProvider = _.sample(settings.weather.defaultProviders.free)
        }

        // PRO only features.
        if (!user.isPro) {
            const resetFields = disableProPreferences(user)
            if (resetFields.length > 0) {
                fields.push(...resetFields)
            }
        }

        if (fields.length > 0) {
            logger.warn("Users.validatePreferences", user.id, user.displayName, `isPRO: ${user.isPro}`, "Invalid fields reverted to default", `${fields.join(", ")}`)
        }
    } catch (ex) {
        logger.error("Users.validatePreferences", user.id, user.displayName, ex)
    }
}
