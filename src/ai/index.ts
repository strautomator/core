// Strautomator Core: AI / LLM

import {AiGenerateOptions, AiGeneratedResponse, AiProvider} from "./types"
import {UserData} from "../users/types"
import {translation} from "../translations"
import gemini from "../gemini"
import openai from "../openai"
import _ from "lodash"
import cache from "bitecache"
import logger from "anyhow"
import * as logHelper from "../loghelper"
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

    // INIT
    // --------------------------------------------------------------------------

    /**
     * Init the AI / LLM wrapper.
     */
    init = async (): Promise<void> => {
        try {
            cache.setup("ai", settings.ai.cacheDuration)
            logger.info("AI.init", `Cache prompt responses for up to ${settings.ai.cacheDuration} seconds`)
        } catch (ex) {
            logger.error("AI.init", ex)
        }
    }

    // METHODS
    // --------------------------------------------------------------------------

    /**
     * Generate the activity name based on its parameters.
     * @param user The user.
     * @param options AI generation options.
     */
    private activityPrompt = async (user: UserData, options: AiGenerateOptions): Promise<AiGeneratedResponse> => {
        if (!options.provider) {
            options.provider = user.isPro && user.preferences.aiProvider ? user.preferences.aiProvider : Math.random() <= 0.5 ? "gemini" : "openai"
        }

        const activity = options.activity
        const sportType = activity.sportType.replace(/([A-Z])/g, " $1").trim()
        const customPrompt = user.preferences.aiPrompt
        const arrPrompt = []
        arrPrompt.push(...options.prepend)

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

            // Add elevation mostly if less than 100m or more than 700m.
            const elevationUnit = activity.elevationUnit || "m"
            const skipElevationRange = elevationUnit == "ft" ? {min: 300, max: 2100} : {min: 100, max: 700}
            const rndElevation = Math.random() < 0.2
            if (!_.isNil(activity.elevationGain) && (rndElevation || activity.elevationGain < skipElevationRange.min || activity.elevationGain > skipElevationRange.max)) {
                arrPrompt.push(`Elevation gain was ${activity.elevationGain}${elevationUnit}.`)
            }

            // Add power data mostly if less than 140W or more than 200W, otherwise add heart rate data.
            const rndPower = Math.random() < 0.2
            if (activity.hasPower && (rndPower || activity.wattsWeighted < 140 || activity.wattsWeighted > 200)) {
                arrPrompt.push(`Average power was ${activity.wattsWeighted} watts.`)
            } else if (activity.hrAvg > 0) {
                arrPrompt.push(`Average heart rate was ${activity.hrAvg} BPM.`)
            }

            // Add max speed in case it was high enough.
            const rndSpeed = Math.random() < 0.2
            if (rndSpeed || activity.speedMax > 65 || (activity.speedMax > 40 && user.profile.units == "imperial")) {
                arrPrompt.push(`Maximum speed was very high at ${activity.speedMax}${activity.speedUnit}.`)
            }

            // Add weather data?
            if (options.weatherSummaries) {
                const weatherText = options.weatherSummaries.mid?.summary || options.weatherSummaries.start?.summary || options.weatherSummaries.end?.summary || "ok"
                arrPrompt.push(`The weather was ${weatherText.toLowerCase()}.`)
                if (options.weatherSummaries.start?.aqi > 4 || options.weatherSummaries.end?.aqi > 4) {
                    arrPrompt.push("Air quality was extremely unhealthy.")
                }
            }

            // Add the user's custom AI prompt, otherwise fallback to a generic humour + translation, if needed.
            if (customPrompt) {
                arrPrompt.push(customPrompt)
            } else {
                const humour = options.humour || _.sample(settings.ai.humours)
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
            logger.error("AI.activityPrompt", logHelper.user(user), logHelper.activity(activity), "Failure while building the prompt", ex)
        }

        if (options.append?.length > 0) {
            arrPrompt.push(...options.append)
        }

        // Start with the preferred provider, and keep trying until everything fails.
        const providers = [openai, gemini]
        const preferredProviders = _.remove(providers, (p) => p.constructor.name.toLowerCase() == user.preferences.aiProvider)
        let provider: AiProvider = preferredProviders.pop() || providers.pop()

        // Keep trying with different providers.
        let response: string
        while (!response && providers.length > 0) {
            try {
                response = await provider.activityPrompt(user, activity, arrPrompt, options.maxTokens)
                if (!response) {
                    provider = providers.pop()
                }
            } catch (ex) {
                logger.warn("AI.activityPrompt", logHelper.user(user), logHelper.activity(activity), `${provider.constructor.name} failed, will try another`)
            }
        }

        // Got a valid response?
        if (response) {
            return {
                provider: provider.constructor.name.toLowerCase() as any,
                prompt: arrPrompt.join(" "),
                response: response
            }
        }

        // Everything else failed.
        return null
    }

    /**
     * Generate the activity name based on its parameters.
     * @param user The user.
     * @param options AI generation options.
     */
    generateActivityName = async (user: UserData, options: AiGenerateOptions): Promise<AiGeneratedResponse> => {
        try {
            const cacheId = `name-${this.getCacheId(options)}`
            const fromCache = cache.get("ai", cacheId)
            if (fromCache) {
                logger.info("AI.generateActivityName", logHelper.user(user), logHelper.activity(options.activity), fromCache.provider, "Cached response", fromCache.response)
                return fromCache
            }

            // Generation options.
            const sportType = options.activity.sportType.replace(/([A-Z])/g, " $1").trim()
            options.maxTokens = 25
            options.prepend = [`Please generate a single name for my Strava ${options.activity.commute ? "commute" : sportType.toLowerCase()}.`]
            options.append = [`Answer the generated name only, with no additional text.`]

            // Generate and cache the result.
            const result = await this.activityPrompt(user, options)
            if (result) {
                cache.set("ai", cacheId, result)
                logger.info("AI.generateActivityName", logHelper.user(user), logHelper.activity(options.activity), result.provider, result.response)
                return result
            }

            logger.warn("AI.generateActivityName", logHelper.user(user), logHelper.activity(options.activity), "AI failed")
            return null
        } catch (ex) {
            logger.error("AI.generateActivityName", logHelper.user(user), logHelper.activity(options.activity), ex)
            return null
        }
    }

    /**
     * Generate a short poem for the specified Strava activity.
     * @param user The user.
     * @param options AI generation options.
     */
    generateActivityDescription = async (user: UserData, options: AiGenerateOptions): Promise<AiGeneratedResponse> => {
        try {
            const cacheId = `description-${this.getCacheId(options)}`
            const fromCache = cache.get("ai", cacheId)
            if (fromCache) {
                logger.info("AI.generateActivityDescription", logHelper.user(user), logHelper.activity(options.activity), fromCache.provider, "Cached response", fromCache.response)
                return fromCache
            }

            // Generation options.
            const sportType = options.activity.sportType.replace(/([A-Z])/g, " $1").trim()
            options.maxTokens = 150
            options.prepend = [`Please write a very short poem for my Strava ${options.activity.commute ? "commute" : sportType.toLowerCase()}.`]
            options.append = [`Answer the generated poem only, with no additional text, limited to a maximum of 10 lines.`]

            // Generate and cache the result.
            const result = await this.activityPrompt(user, options)
            if (result) {
                cache.set("ai", cacheId, result)
                logger.info("AI.generateActivityDescription", logHelper.user(user), logHelper.activity(options.activity), result.provider, result.response)
                return result
            }

            logger.warn("AI.generateActivityName", logHelper.user(user), logHelper.activity(options.activity), "AI failed")
            return null
        } catch (ex) {
            logger.error("AI.generateActivityDescription", logHelper.user(user), logHelper.activity(options.activity), ex)
            return null
        }
    }

    // HELPERS
    // --------------------------------------------------------------------------

    /**
     * Helper to get the cache ID for the specified AI generation options.
     * @param options Provider, humour and activity details.
     */
    private getCacheId = (options: AiGenerateOptions): string => {
        return `${options.provider || "default"}-${options.humour || "random"}-${options.activity.id}`
    }
}

// Exports...
export default AI.Instance
