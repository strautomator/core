// Strautomator Core: OpenAI (ChatGPT)

import {StravaActivity} from "../strava/types"
import {UserData} from "../users/types"
import {ActivityWeather} from "../weather/types"
import {axiosRequest} from "../axios"
import _ from "lodash"
import logger = require("anyhow")
const settings = require("setmeup").settings
const packageVersion = require("../../package.json").version

/**
 * OpenAI (ChatGPT) wrapper.
 */
export class OpenAI {
    private constructor() {}
    private static _instance: OpenAI
    static get Instance() {
        return this._instance || (this._instance = new this())
    }

    // INIT
    // --------------------------------------------------------------------------

    /**
     * Init the OpenAI wrapper.
     */
    init = async (): Promise<void> => {
        try {
            if (!settings.openai.api.key) {
                throw new Error("Missing the openai.api.key setting")
            }
        } catch (ex) {
            logger.error("OpenAI.init", ex)
        }
    }

    // METHODS
    // --------------------------------------------------------------------------

    /**
     * Generate the activity name based on its parameters.
     * @param user The user.
     * @param activity The Strava activity.
     * @param weatherSummaries Optional weather for the start and end of the activity.
     */
    generateActivityName = async (user: UserData, activity: StravaActivity, weatherSummaries?: ActivityWeather): Promise<string> => {
        try {
            const adj = _.sample(["cool", "funny", "exquisite", "silly", "sarcastic", "ironic", "mocking", "very cool", "very funny", "very silly", "unique"])
            const arrPrompt = [`Please generate a single ${adj} name for my Strava ${activity.commute ? "commute" : "activity"}.`]

            if (activity.distance > 0 && activity.movingTime > 0) {
                arrPrompt.push(`I've done ${activity.distance} ${activity.distanceUnit} in ${activity.movingTimeString}.`)
                arrPrompt.push(`Maximum speed was ${activity.speedMax}${activity.speedUnit}.`)
            }
            if (activity.elevationGain > 0) {
                arrPrompt.push(`Total elevation gain was ${activity.elevationGain}${activity.elevationUnit}.`)
            }
            if (activity.hasPower && activity.wattsWeighted > 0) {
                arrPrompt.push(`My average power was ${activity.wattsWeighted} watts.`)
            }
            if (activity.speedMax > 70 || (activity.speedMax > 44 && user.profile.units == "imperial")) {
                arrPrompt.push(`Maximum speed was ${activity.speedMax}${activity.speedUnit}.`)
            }
            if (weatherSummaries) {
                if (weatherSummaries.start && weatherSummaries.end && weatherSummaries.start.summary != weatherSummaries.end.summary) {
                    arrPrompt.push(`The weather at the start was ${weatherSummaries.start.summary}, and at the end it was ${weatherSummaries.end.summary}.`)
                } else {
                    arrPrompt.push(`The weather was ${weatherSummaries.mid?.summary || weatherSummaries.start?.summary || weatherSummaries.end?.summary || "mixed"}.`)
                }
                if (weatherSummaries.start?.aqi > 3 || weatherSummaries.end?.aqi > 3) {
                    arrPrompt.push("The air quality index was very unhealthy.")
                }
            }

            // Avoid boilerplate around the actual answer.
            arrPrompt.push("Answer the generated name only, with no additional text.")

            // Get final prompt and request options.
            const content = arrPrompt.join(" ")
            const options = {
                url: settings.openai.api.baseUrl,
                method: "POST",
                headers: {},
                data: {
                    model: "gpt-3.5-turbo",
                    messages: [{role: "user", content: content}],
                    max_tokens: settings.openai.maxTokens,
                    temperature: 1,
                    top_p: 1
                }
            }

            // Append headers.
            options.headers["Authorization"] = `Bearer ${settings.openai.api.key}`
            options.headers["User-Agent"] = `${settings.app.title} / ${packageVersion}`

            logger.debug("OpenAI.generateActivityName", `User ${user.id} ${user.displayName}`, `Activity ${activity.id}`, `Prompt: ${content}`)

            // Here we go!
            const res = await axiosRequest(options)

            // Successful prompt response? Extract the generated activity name.
            if (res?.choices?.length > 0) {
                const arrName = res.choices[0].message.content.split(`"`)
                const activityName = arrName.length > 1 ? arrName[1] : arrName[0]

                // Ends with a period, but has no question? Remove it.
                if (activityName.substring(activityName.length - 1) == "." && !activityName.includes("?")) {
                    return activityName.substring(0, activityName.length - 1).trim()
                }

                return activityName.trim()
            }

            // Failed to generate the activity name.
            logger.warn("OpenAI.generateActivityName", `User ${user.id} ${user.displayName}`, `Activity ${activity.id}`, "Failed to generate")
            return null
        } catch (ex) {
            logger.error("OpenAI.generateActivityName", `User ${user.id} ${user.displayName}`, `Activity ${activity.id}`, ex)
            return null
        }
    }
}

// Exports...
export default OpenAI.Instance
