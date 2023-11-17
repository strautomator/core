// Strautomator Core: OpenAI (ChatGPT)

import {ChatGptResponse} from "./types"
import {StravaActivity} from "../strava/types"
import {UserData} from "../users/types"
import {ActivityWeather} from "../weather/types"
import {translation} from "../translations"
import {AxiosConfig, axiosRequest} from "../axios"
import _ from "lodash"
import logger from "anyhow"
import * as logHelper from "../loghelper"
import cache from "bitecache"
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

            cache.setup("openai", settings.openai.cacheDuration)
            logger.info("OpenAI.init", `Cache prompt results for up to ${settings.openai.cacheDuration} seconds`)
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
     * @param humour Optional humour to be used on the prompt.
     * @param weatherSummaries Optional weather for the start and end of the activity.
     */
    generateActivityName = async (user: UserData, activity: StravaActivity, humour?: string, weatherSummaries?: ActivityWeather): Promise<ChatGptResponse> => {
        try {
            const baseCacheId = `activity-${activity.id}`
            const cacheId = humour ? `${baseCacheId}-${humour}` : baseCacheId
            const fromCache = cache.get("openai", cacheId)
            if (fromCache) {
                logger.info("OpenAI.generateActivityName", logHelper.user(user), logHelper.activity(activity), fromCache)
                return fromCache
            }

            const sportType = activity.sportType.replace(/([A-Z])/g, " $1").trim()
            const customPrompt = user.preferences.chatGptPrompt
            const arrPrompt = [`Please generate a single name for my Strava ${activity.commute ? "commute" : sportType.toLowerCase()}.`]
            const verb = sportType.includes("ride") ? "rode" : sportType.includes("run") ? "ran" : "did"

            // Add relative effort context to the prompt.
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
            const skipElevationRange = {m: [100, 700], ft: [300, 2100]}
            const elevationUnit = activity.elevationUnit || "m"
            if (!_.isNil(activity.elevationGain) && (activity.elevationGain < skipElevationRange[elevationUnit][0] || activity.elevationGain > skipElevationRange[elevationUnit][1])) {
                arrPrompt.push(`Elevation gain was ${activity.elevationGain}${activity.elevationUnit}.`)
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

            // Add the user's custom ChatGPT prompt, otherwise fallback to the specified or a random humour.
            if (!humour && customPrompt) {
                arrPrompt.push(customPrompt)
            } else {
                if (!humour) {
                    humour = _.sample(settings.openai.humours)
                }
                arrPrompt.push(`Please be very ${humour} with the choice of words.`)
            }

            // Translate to the user's language (if other than English).
            let languagePrompt = "."
            if (user.preferences.language && user.preferences.language != "en") {
                const languageName = translation("LanguageName", user.preferences)
                languagePrompt = `, in ${languageName} language.`
            }

            // Avoid boilerplate around the actual answer.
            arrPrompt.push(`Answer the generated name only, with no additional text${languagePrompt}`)

            // Get final prompt and request options.
            const content = arrPrompt.join(" ")
            const options: AxiosConfig = {
                url: `${settings.openai.api.baseUrl}chat/completions`,
                method: "POST",
                headers: {},
                data: {
                    model: user.isPro && Math.random() < 0.3 ? "gpt-4-1106-preview" : "gpt-3.5-turbo",
                    messages: [{role: "user", content: content}],
                    max_tokens: settings.openai.maxTokens,
                    temperature: 1,
                    top_p: 1
                },
                onRetry: (opt) => {
                    opt.data.model = "gpt-3.5-turbo"
                }
            }

            // Append headers.
            options.headers["Authorization"] = `Bearer ${settings.openai.api.key}`
            options.headers["User-Agent"] = `${settings.app.title} / ${packageVersion}`

            logger.debug("OpenAI.generateActivityName", logHelper.user(user), logHelper.activity(activity), `Prompt: ${content}`)

            // Here we go!
            const res = await axiosRequest(options)

            // Successful prompt response? Extract the generated activity name.
            if (res?.choices?.length > 0) {
                const arrName = res.choices[0].message.content.split(`"`)
                let activityName = arrName.length > 1 ? arrName[1] : arrName[0]

                // Ends with a period, but has no question? Remove it.
                if (activityName.substring(activityName.length - 1) == "." && !activityName.includes("?")) {
                    activityName = activityName.substring(0, activityName.length - 1).trim()
                } else {
                    activityName = activityName.trim()
                }

                // Cache and return the response.
                const result: ChatGptResponse = {prompt: content, response: activityName}
                cache.set("openai", cacheId, result)
                logger.info("OpenAI.generateActivityName", logHelper.user(user), logHelper.activity(activity), `${weatherSummaries ? "with" : "without"} weather`, `Humour: ${humour}`, activityName)

                return result
            }

            // Failed to generate the activity name.
            logger.warn("OpenAI.generateActivityName", logHelper.user(user), logHelper.activity(activity), "Failed to generate")
            return null
        } catch (ex) {
            logger.error("OpenAI.generateActivityName", logHelper.user(user), logHelper.activity(activity), ex)
            return null
        }
    }

    /**
     * Validate a prompt against OpenAI's moderation API, returns flagged categories or null if no issues were found.
     * @param user The user triggering the validation.
     * @param prompt Prompt to be validated.
     */
    validatePrompt = async (user: UserData, prompt: string): Promise<string[]> => {
        try {
            const options: AxiosConfig = {
                url: `${settings.openai.api.baseUrl}moderations`,
                method: "POST",
                headers: {},
                data: {input: prompt}
            }

            // Append headers.
            options.headers["Authorization"] = `Bearer ${settings.openai.api.key}`
            options.headers["User-Agent"] = `${settings.app.title} / ${packageVersion}`

            // Stop if no results were returned, or if nothing was flagged.
            const res = await axiosRequest(options)
            if (!res) {
                return null
            }
            const result = res.results.find((r) => r.flagged)
            if (!result) {
                return null
            }

            // Return list of categories that failed the moderation.
            const categories = Object.keys(_.pickBy(result.categories, (i) => i == true))
            logger.info("OpenAI.validatePrompt", logHelper.user(user), prompt, `Failed: ${categories.join(", ")}`)
            return categories
        } catch (ex) {
            logger.error("OpenAI.validatePrompt", logHelper.user(user), prompt, ex)
            return null
        }
    }
}

// Exports...
export default OpenAI.Instance
