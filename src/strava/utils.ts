// Strautomator Core: Strava utils

import {StravaActivity} from "./types"
import {UserData} from "../users/types"
import {recipePropertyList} from "../recipes/lists"
import dayjs from "../dayjs"
import _ = require("lodash")

/**
 * Process the activity and add the necessary suffixes to its fields.
 * @param user The user owning the activity.
 * @param activity The Strava activity to be transformed.
 */
export const transformActivityFields = (user: UserData, activity: StravaActivity): void => {
    for (let prop of recipePropertyList) {
        let suffix = user.profile.units == "imperial" && prop.impSuffix ? prop.impSuffix : prop.suffix

        // Farenheit temperature suffix (special case).
        if (prop.fSuffix && user.preferences && user.preferences.weatherUnit == "f") {
            suffix = prop.fSuffix
        }

        // Make sure times are set using the format "HH:MM".
        if (prop.type == "time") {
            if (_.isNumber(activity[prop.value])) {
                const aDuration = dayjs.duration(activity[prop.value], "seconds")
                activity[prop.value] = aDuration.format("HH:mm")
            } else if (_.isDate(activity[prop.value])) {
                const aDate = dayjs.utc(activity[prop.value]).add(activity.utcStartOffset, "minutes")
                activity[prop.value] = aDate.format("HH:mm")
            }
        }

        // Append suffixes.
        if (suffix && !_.isNil(activity[prop.value]) && !_.isDate(activity[prop.value])) {
            activity[prop.value] = `${activity[prop.value]}${suffix}`
        }
    }
}
