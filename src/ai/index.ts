// Strautomator Core: AI / LLM

import {AiGenerateOptions, AiGeneratedResponse, AiProvider} from "./types"
import {UserData} from "../users/types"
import {translation} from "../translations"
import anthropic from "../anthropic"
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
            const weatherSummaries = options.weatherSummaries
            if (weatherSummaries && (weatherSummaries.mid?.summary || weatherSummaries.start?.summary || weatherSummaries.end?.summary)) {
                const weatherText = weatherSummaries.mid?.summary || weatherSummaries.start?.summary || weatherSummaries.end?.summary
                arrPrompt.push(`The weather was ${weatherText.toLowerCase()}, `)

                const weatherTemps = _.without([weatherSummaries.mid?.temperature || weatherSummaries.start?.temperature || weatherSummaries.end?.temperature], null, undefined)
                const tempSuffix = user.preferences?.weatherUnit == "f" ? "°F" : "°C"
                const minTemp = _.min(weatherTemps) || 0
                const maxTemp = _.max(weatherTemps) || 0
                arrPrompt.push(`with temperatures ranging from ${minTemp}${tempSuffix} to ${maxTemp}${tempSuffix}.`)

                const weatherAqis = _.without([weatherSummaries.mid?.aqi, weatherSummaries.start?.aqi, weatherSummaries.end?.aqi], null, undefined)
                const weatherAqi = _.max(weatherAqis) || 0
                if (weatherAqi > 4) {
                    arrPrompt.push("The air quality was extremely bad.")
                } else if (weatherAqi > 3) {
                    arrPrompt.push("The air quality was bad.")
                }
            }

            // Add the user's custom AI prompt, otherwise fallback to a generic humour + translation, if needed.
            if (customPrompt?.length > 3) {
                arrPrompt.push(customPrompt)
            } else {
                const humour = options.humour || _.sample(settings.ai.humours)
                arrPrompt.push(`Please be very ${humour} with the choice of words.`)

                // Translate to the user's language (if other than English).
                if (user.preferences.language && user.preferences.language != "en") {
                    const languageName = translation("LanguageName", user.preferences)
                    arrPrompt.push(`The answer should be translated to ${languageName}.`)
                }
            }
        } catch (ex) {
            logger.error("AI.activityPrompt", logHelper.user(user), logHelper.activity(activity), "Failure while building the prompt", ex)
        }

        if (options.append?.length > 0) {
            arrPrompt.push(...options.append)
        }

        // Filter providers that are being rate limited at the moment, and get the preferrer (if any).
        const providers = [anthropic, openai, gemini].filter(async (p) => (await p.limiter.currentReservoir()) > 0)
        const preferredProviders = _.remove(providers, (p) => p.constructor.name.toLowerCase() == user.preferences.aiProvider)
        let provider: AiProvider = preferredProviders.pop() || providers.pop()

        // Keep trying with different providers.
        let response: string
        while (!response && provider) {
            try {
                response = await provider.activityPrompt(user, activity, arrPrompt, options.maxTokens)
                if (!response) {
                    logger.warn("AI.activityPrompt", logHelper.user(user), logHelper.activity(activity), `Empty response from ${provider.constructor.name}, will try another`)
                    provider = providers.length > 0 ? providers.pop() : null
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
            options.maxTokens = settings.ai.maxTokens.short
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
            options.maxTokens = settings.ai.maxTokens.long
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
