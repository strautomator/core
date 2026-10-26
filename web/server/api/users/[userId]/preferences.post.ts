// Strautomator API: Update user preferences

import {logHelper, strava, users} from "strautomator-core"
import type {UserData, UserPreferences} from "strautomator-core"
import {FieldValue} from "@google-cloud/firestore"
import {defineEventHandler} from "nuxt/server"
import {requestValidator} from "../../../utils/auth"
import {getBody, renderError, renderJson} from "../../../utils/web"
import dayjs from "../../../utils/dayjs"
import _ from "lodash"
import logger from "anyhow"
import setmeup from "setmeup"
const settings = setmeup.settings

/**
 * Update user preferences.
 */
export default defineEventHandler(async (event) => {
    try {
        const user = await requestValidator(event)
        const body = (await getBody(event)) || {}
        const preferences: UserPreferences = {}

        if (Object.keys(body).length == 0) {
            logger.warn("Routes.users", logHelper.user(user), "Empty request body was sent, preferences not saved")
            return renderJson(event, user.preferences)
        }

        const preferenceChanged = (field: string) => !_.isNil(body[field]) && body[field] !== user.preferences[field]

        const setOrDelete = (field: string, defaultValue: any, isBoolean?: boolean) => {
            const value = isBoolean ? (body[field] ? true : false) : body[field]

            if (value != defaultValue) {
                preferences[field] = value
            } else if (user.preferences[field] == defaultValue || (user.preferences[field] && value == defaultValue)) {
                preferences[field] = FieldValue.delete()
            }
        }

        if (preferenceChanged("weatherProvider")) {
            if (!user.isPro) {
                body.weatherProvider = ""
            }
            setOrDelete("weatherProvider", "")
        }

        if (preferenceChanged("weatherUnit")) {
            setOrDelete("weatherUnit", "c")
        }

        if (preferenceChanged("windSpeedUnit") && ["m/s", "kph", "mph"].includes(body.windSpeedUnit)) {
            setOrDelete("windSpeedUnit", "")
        }

        if (preferenceChanged("language")) {
            body.language = body.language.toString().substring(0, 2)
            setOrDelete("language", "en")
        }

        if (preferenceChanged("ftpAutoUpdate")) {
            if (!user.isPro) {
                body.ftpAutoUpdate = false
            }
            setOrDelete("ftpAutoUpdate", false, true)
        }

        if (preferenceChanged("delayedProcessing")) {
            setOrDelete("delayedProcessing", false, true)
        }

        if (preferenceChanged("gearwearDelayDays")) {
            setOrDelete("gearwearDelayDays", settings.gearwear.delayDays)
        }

        if (preferenceChanged("gearwearBatteryAlert")) {
            if (!user.isPro) {
                body.gearwearBatteryAlert = false
            }
            setOrDelete("gearwearBatteryAlert", false, true)
        }

        if (preferenceChanged("dateResetCounter")) {
            if (body.dateResetCounter) {
                const dateResetCounter = dayjs(`2000-${body.dateResetCounter}`)
                if (!dateResetCounter.isValid()) {
                    throw new Error(`Invalid counter reset date: ${body.dateResetCounter}`)
                }
            } else {
                body.dateResetCounter = false
            }
            setOrDelete("dateResetCounter", false)
        }

        if (preferenceChanged("noSuffixes")) {
            setOrDelete("noSuffixes", false, true)
        }

        if (preferenceChanged("privacyMode")) {
            setOrDelete("privacyMode", false, true)
        }

        if (preferenceChanged("linksOn")) {
            if (!user.isPro && (body.linksOn < 1 || body.linksOn > 5)) {
                body.linksOn = 5
            }
            setOrDelete("linksOn", user.isPro ? settings.plans.pro.linksOn : settings.plans.free.linksOn)
        }

        if (preferenceChanged("activityHashtag")) {
            setOrDelete("activityHashtag", false, true)
        }

        if (preferenceChanged("firstDayOfWeek")) {
            setOrDelete("firstDayOfWeek", "sunday")
        }

        if (preferenceChanged("aiEnabled")) {
            if (!user.isPro) {
                body.aiEnabled = false
            }
            setOrDelete("aiEnabled", "")
        }

        if (preferenceChanged("aiProvider")) {
            if (!user.isPro) {
                body.aiProvider = ""
            }
            setOrDelete("aiProvider", "")
        }

        const data: Partial<UserData> = {
            id: user.id,
            displayName: user.displayName,
            isPro: user.isPro,
            preferences: preferences
        }

        users.validatePreferences(data)

        if (!user.preferences.privacyMode && preferences.privacyMode) {
            users.anonymize(data)
        } else if (user.preferences.privacyMode && !preferences.privacyMode) {
            user.profile = await strava.athletes.getAthlete(user.stravaTokens)
        }

        await users.update(data)
        return renderJson(event, preferences)
    } catch (ex) {
        return renderError(event, ex, 400)
    }
})
