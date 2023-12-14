// Strautomator Core: AI / LLM

import {StravaActivity} from "../strava/types"
import {UserData} from "../users/types"
import {ActivityWeather} from "../weather/types"
import {translation} from "../translations"
import gemini from "../gemini"
import openai from "../openai"
import _ from "lodash"
import logger from "anyhow"
import * as logHelper from "../loghelper"
import {AiGeneratedResponse} from "./types"
const settings = require("setmeup").settings

/**
 * AI / LLM wrapper.
 */
export class AI {
    private constructor() {}
    private static _instance: AI
    static get Instance() {
        return this._instance || (this._instance = new this())
    }

    // METHODS
    // --------------------------------------------------------------------------

    /**
     * Generate the activity name based on its parameters.
     * @param user The user.
     * @param activity The Strava activity.
     * @param humour Optional humour to be used on the prompt.
     * @param weatherSummaries Optional weather for the start and end of the activity.
     */
    generateActivityName = async (user: UserData, activity: StravaActivity, humour?: string, weatherSummaries?: ActivityWeather): Promise<AiGeneratedResponse> => {
        const sportType = activity.sportType.replace(/([A-Z])/g, " $1").trim()
        const customPrompt = user.preferences.aiPrompt
        const arrPrompt = [`Please generate a single name for my Strava ${activity.commute ? "commute" : sportType.toLowerCase()}.`]

        try {
            const verb = sportType.includes("ride") ? "rode" : sportType.includes("run") ? "ran" : "did"

            // Add relative effort context.
            if (activity.relativeEffort > 600) {
                arrPrompt.push("That was one of the hardest workouts I've ever done.")
            } else if (activity.relativeEffort > 300) {
                arrPrompt.push("The workout felt pretty hard.")
            } else if (activity.relativeEffort < 30) {
                arrPrompt.push("The workout felt very easy.")
            }

            // Only add distance if moving time was also set.
            if (activity.distance > 0 && activity.movingTime > 0) {
                arrPrompt.push(`I ${verb} ${activity.distance}${activity.distanceUnit} in ${activity.movingTimeString}.`)
            }

            // Only add elevation if less than 100m or more than 700m.
            const elevationUnit = activity.elevationUnit || "m"
            const skipElevationRange = elevationUnit == "ft" ? {min: 300, max: 2100} : {min: 100, max: 700}
            if (!_.isNil(activity.elevationGain) && (activity.elevationGain < skipElevationRange.min || activity.elevationGain > skipElevationRange.max)) {
                arrPrompt.push(`Elevation gain was ${activity.elevationGain}${elevationUnit}.`)
            }

            // Only add power data if less than 140W or more than 200W, otherwise add heart rate data.
            if (activity.hasPower && (activity.wattsWeighted < 140 || activity.wattsWeighted > 200)) {
                arrPrompt.push(`Average power was ${activity.wattsWeighted} watts.`)
            } else if (activity.hrAvg > 0) {
                arrPrompt.push(`Average heart rate was ${activity.hrAvg} BPM.`)
            }

            // Add max speed in case it was high enough.
            if (activity.speedMax > 65 || (activity.speedMax > 40 && user.profile.units == "imperial")) {
                arrPrompt.push(`Maximum speed was very high at ${activity.speedMax}${activity.speedUnit}.`)
            }

            // Add weather data?
            if (weatherSummaries) {
                const weatherText = weatherSummaries.mid?.summary || weatherSummaries.start?.summary || weatherSummaries.end?.summary || "ok"
                arrPrompt.push(`The weather was ${weatherText.toLowerCase()}.`)
                if (weatherSummaries.start?.aqi > 4 || weatherSummaries.end?.aqi > 4) {
                    arrPrompt.push("Air quality was extremely unhealthy.")
                }
            }

            // Add the user's custom AI prompt, otherwise fallback to a generic humour + translation, if needed.
            if (customPrompt) {
                arrPrompt.push(customPrompt)
            } else {
                if (!humour) {
                    humour = _.sample(settings.ai.humours)
                }
                arrPrompt.push(`Please be very ${humour} with the choice of words.`)

                // Translate to the user's language (if other than English).
                let languagePrompt = "."
                if (user.preferences.language && user.preferences.language != "en") {
                    const languageName = translation("LanguageName", user.preferences)
                    languagePrompt = `, translated to ${languageName} language.`
                }

                // Avoid boilerplate around the actual answer.
                arrPrompt.push(`Answer the generated name only, with no additional text${languagePrompt}`)
            }
        } catch (ex) {
            logger.error("AI.generateActivityName", logHelper.user(user), logHelper.activity(activity), "Failure while building the prompt", ex)
        }

        // Decide which AI model to use.
        const provider = user.preferences.aiProvider || Math.random() < 0.3 ? gemini : openai
        const fallback = provider == gemini ? openai : gemini
        let response: string

        // Try with the selected provider, and fallback to the other if it fails.
        try {
            response = await provider.generateActivityName(user, activity, arrPrompt)
            if (!response) {
                throw new Error(`Got no response from ${provider.constructor.name}`)
            }
        } catch (ex) {
            logger.error("AI.generateActivityName", logHelper.user(user), logHelper.activity(activity), ex)
            try {
                response = await fallback.generateActivityName(user, activity, arrPrompt)
            } catch (innerEx) {
                logger.error("AI.generateActivityName", logHelper.user(user), logHelper.activity(activity), innerEx)
            }
        }

        // Got a valid response?
        if (response) {
            return {
                prompt: arrPrompt.join(" "),
                response: response
            }
        }

        return null
    }
}

// Exports...
export default AI.Instance
