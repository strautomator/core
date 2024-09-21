// Strautomator Core: AI / LLM

import {AiGenerateOptions, AiGeneratedResponse, AiProvider} from "./types"
import {calculatePowerIntervals} from "../strava/utils"
import {UserData} from "../users/types"
import {translation} from "../translations"
import anthropic from "../anthropic"
import gemini from "../gemini"
import openai from "../openai"
import _ from "lodash"
import cache from "bitecache"
import logger from "anyhow"
import dayjs from "../dayjs"
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
     * Generate the activity name or description based on its parameters.
     * @param user The user.
     * @param options AI generation options.
     * @param messages Messages to be sent.
     */
    private prompt = async (user: UserData, options: AiGenerateOptions, messages: string[]): Promise<AiGeneratedResponse> => {
        const activity = options.activity
        const subject = options.activity ? logHelper.activity(activity) : options.subject

        // Filter providers that are being rate limited at the moment, and get the preferrer (if any).
        const providers = [anthropic, openai, gemini].filter(async (p: AiProvider) => !p.limiter || (await p.limiter.currentReservoir()) > 0)
        const preferredProviders = _.remove(providers, (p) => p.constructor.name.toLowerCase() == options.provider)
        let provider: AiProvider = preferredProviders.pop() || providers.pop()

        // Keep trying with different providers.
        let response: string
        while (!response && provider) {
            try {
                response = await provider.prompt(user, options, messages)
                if (!response) {
                    logger.warn("AI.prompt", logHelper.user(user), subject, `Empty response from ${provider.constructor.name}, will try another`)
                    provider = providers.length > 0 ? providers.pop() : null
                }
            } catch (ex) {
                logger.warn("AI.prompt", logHelper.user(user), subject, `${provider.constructor.name} failed, will try another`)
            }
        }

        // Got a valid response?
        if (response) {
            const result = {
                provider: provider.constructor.name.toLowerCase() as any,
                prompt: messages.join(" "),
                response: response
            }
            if (user.debug) {
                logger.warn("AI.prompt.debug", logHelper.user(user), subject, result.provider, `Prompt: ${result.prompt}`, `Response: ${result.response}`)
            }
            return result
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
            options.maxTokens = settings.ai.maxTokens.name
            options.instruction = "You are an assistant to create creative titles for Strava activities."

            // Check if a generated name is cached.
            const cacheId = `name-${this.getCacheId(options)}`
            const fromCache = cache.get("ai", cacheId)
            if (fromCache) {
                logger.info("AI.generateActivityName", logHelper.user(user), logHelper.activity(options.activity), fromCache.provider, "Cached response", fromCache.response)
                return fromCache
            }

            const sportType = options.activity.sportType.replace(/([A-Z])/g, " $1").trim()
            let aDate = dayjs(options.activity.dateStart)
            if (options.activity.utcStartOffset) {
                aDate = aDate.add(options.activity.utcStartOffset, "minutes")
            }

            // Get the activity prompt.
            const messages = [`Please generate a single name for my Strava ${options.activity.commute ? "commute" : sportType.toLowerCase()}. The activity started at ${aDate.format("HH:MM")}.`]
            messages.push(...this.getActivityPrompt(user, options))
            messages.push("Answer the generated name only, with no additional text or Markdown formatting.")
            messages.push(...this.getHumourAndTranslation(user, options))

            // Generate and cache the result.
            const result = await this.prompt(user, options, messages)
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
            options.maxTokens = settings.ai.maxTokens.description
            options.instruction = "You are an assistant to create poems to describe Strava activities."

            // Check if a generated description is cached.
            const cacheId = `description-${this.getCacheId(options)}`
            const fromCache = cache.get("ai", cacheId)
            if (fromCache) {
                logger.info("AI.generateActivityDescription", logHelper.user(user), logHelper.activity(options.activity), fromCache.provider, "Cached response", fromCache.response)
                return fromCache
            }

            // Get the activity prompt.
            const sportType = options.activity.sportType.replace(/([A-Z])/g, " $1").trim()
            const messages = [`Please write a very short poem for my Strava ${options.activity.commute ? "commute" : sportType.toLowerCase()}.`]
            messages.push(...this.getActivityPrompt(user, options))
            messages.push("Answer the generated poem only, with no additional text, limited to a maximum of 10 lines.")
            messages.push(...this.getHumourAndTranslation(user, options))

            // Generate and cache the result.
            const result = await this.prompt(user, options, messages)
            if (result) {
                cache.set("ai", cacheId, result)
                logger.info("AI.generateActivityDescription", logHelper.user(user), logHelper.activity(options.activity), result.provider, result.response)
                return result
            }

            logger.warn("AI.generateActivityDescription", logHelper.user(user), logHelper.activity(options.activity), "AI failed")
            return null
        } catch (ex) {
            logger.error("AI.generateActivityDescription", logHelper.user(user), logHelper.activity(options.activity), ex)
            return null
        }
    }

    /**
     * Get insights about the passed activity.
     * @param user The user.
     * @param options AI generation options.
     */
    generateActivityInsights = async (user: UserData, options: AiGenerateOptions): Promise<AiGeneratedResponse> => {
        try {
            options.maxTokens = settings.ai.maxTokens.insights
            options.instruction = "You are an sports coach that analyzes cycling and running workouts, and give direct, to-the-point suggestions to improve performance."

            // At the moment this is enabled for moving activities with at least HR or power data.
            const activity = options.activity
            if (!activity || !activity.distance || !activity.movingTime || (!activity.wattsAvg && !activity.hrAvg)) {
                logger.warn("AI.generateActivityInsights", logHelper.user(user), logHelper.activity(options.activity), "Activity does not have power or HR data, won't generate insights")
                return null
            }

            // Check if we got insights from the cache.
            const cacheId = `insights-${this.getCacheId(options)}`
            const fromCache = cache.get("ai", cacheId)
            if (fromCache) {
                logger.info("AI.generateActivityInsights", logHelper.user(user), logHelper.activity(options.activity), fromCache.provider, "Cached response", fromCache.response)
                return fromCache
            }

            const now = dayjs.utc()
            const messages = ["Please analyze my last activity performance. First I will give you some details about my recent activities."]

            // Recent activities were passed? Use them for context. At the moment we only use activities that have at least power or HR data.
            if (options.recentActivities?.length > 0 && options.fullDetails) {
                for (let a of options.recentActivities) {
                    if (a.id == options.activity.id || (!a.movingTime && !a.wattsAvg && !a.hrAvg)) {
                        continue
                    }
                    const subPrompt = []
                    const days = now.diff(a.dateStart, "days")
                    const duration = dayjs.duration(activity.movingTime, "seconds").format("HH:mm:ss")
                    subPrompt.push(`I ${this.getSportVerb(a.sportType)} ${a.distance} ${a.distanceUnit} ${days} days ago in ${duration}, with an elevation gain of ${a.elevationGain || 0}${a.elevationUnit}.`)

                    if (a.tss > 0) subPrompt.push(`The activity had a TSS of ${a.tss}.`)
                    if (a.wattsAvg > 0) subPrompt.push(`Had an average power of ${a.wattsAvg} watts, maximum ${a.wattsMax} watts.`)
                    if (a.hrAvg > 0) subPrompt.push(`Average heart rate of ${a.hrAvg} BPM, maximum ${a.hrMax} BPM.`)
                    if (a.cadenceAvg) subPrompt.push(`Cadence was ${a.cadenceAvg} RPM.`)
                    if (a.weatherSummary) subPrompt.push(`Weather was ${a.weatherSummary.toLowerCase()}.`)
                    messages.push(subPrompt.join(" "))
                }
            }

            messages.push(`So, now my most recent activity.`)
            messages.push(...this.getActivityPrompt(user, options))
            messages.push("I need you to give me 6 bullet points with a very short summary and advice about the following metrics: speed, power, heart rate, cadence, and a correlation of these metrics with weather and amount of recent activities.")
            messages.push("Do not add any Markdown formatting to the answer.")

            // Generate and cache the result.
            const result = await this.prompt(user, options, messages)
            if (result) {
                cache.set("ai", cacheId, result)
                logger.info("AI.generateActivityInsights", logHelper.user(user), logHelper.activity(options.activity), result.provider, result.response)
                return result
            }

            logger.warn("AI.generateActivityInsights", logHelper.user(user), logHelper.activity(options.activity), "AI failed")
            return null
        } catch (ex) {
            logger.error("AI.generateActivityInsights", logHelper.user(user), logHelper.activity(options.activity), ex)
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

    /**
     * Get the right sport type verb.
     * @param sportType The activity sport.
     */
    private getSportVerb = (sportType: string): string => {
        const value = sportType.replace(/([A-Z])/g, " $1").trim()
        return value.includes("ride") ? "cycled" : value.includes("run") ? "ran" : "did"
    }

    /**
     * Get the messages describing the passed Strava activity via options.
     * @param user The user.
     * @param options AI generation options.
     */
    private getActivityPrompt = (user: UserData, options: AiGenerateOptions): string[] => {
        const activity = options.activity
        const messages = []

        try {
            if (options.fullDetails) {
                if (activity.relativeEffort && activity.relativeEffort > 5) {
                    if (activity.relativeEffort > 500) {
                        messages.push("That was one of the hardest workouts I've ever done.")
                    } else if (activity.relativeEffort > 300) {
                        messages.push("The workout felt pretty hard.")
                    } else if (activity.relativeEffort < 40) {
                        messages.push("The workout felt relatively easy.")
                    }
                }
            }

            // Add distance if moving time was also set.
            if (activity.distance > 0 && activity.movingTime > 0) {
                messages.push(`I ${this.getSportVerb(activity.sportType)} ${activity.distance}${activity.distanceUnit} in ${activity.movingTimeString}.`)
            }

            // Add elevation gain if available.
            const elevationUnit = activity.elevationUnit || "m"
            if (!_.isNil(activity.elevationGain)) {
                messages.push(`Elevation gain was ${activity.elevationGain}${elevationUnit}.`)
            }

            // Add power data if available.
            if (activity.hasPower) {
                if (options.activityStreams?.watts?.avg) {
                    const wattsAvg = options.activityStreams?.watts?.avg
                    messages.push(`Average power was ${wattsAvg.firstHalf} watts on the first half, and ${wattsAvg.secondHalf} watts on the second half.`)
                } else {
                    messages.push(`Average power was ${activity.wattsWeighted} watts.`)
                }

                // Power intervals calculated and FTP sent only when full details are requested.
                if (options.fullDetails) {
                    if (options.activityStreams?.watts.data) {
                        const activityPerformance = calculatePowerIntervals(options.activityStreams.watts.data)
                        messages.push(`My best 5 minutes power was ${activityPerformance.power5min} watts.`)
                    }
                    if (user.profile.ftp) {
                        messages.push(`My current FTP is ${user.profile.ftp} watts.`)
                    }
                }
            }

            // Add heart rate data if available.
            if (options.activityStreams?.hr?.avg) {
                const hrAvg = options.activityStreams?.hr?.avg
                messages.push(`Average heart rate was ${hrAvg.firstHalf} BPM on the first half, and ${hrAvg.secondHalf} BPM on the second half.`)
            } else if (activity.hrAvg > 0) {
                messages.push(`Average heart rate was ${activity.hrAvg} BPM.`)
            }

            // Add max speed in case it was high enough.
            if (activity.speedMax > 0 && (options.fullDetails || activity.speedMax > 65 || (activity.speedMax > 40 && user.profile.units == "imperial"))) {
                messages.push(`Maximum speed was ${activity.speedMax}${activity.speedUnit}.`)
            }

            // Add cadence data if available, only if full details are requested.
            if (options.fullDetails) {
                if (options.activityStreams?.cadence?.avg) {
                    const cadenceAvg = options.activityStreams?.cadence?.avg
                    messages.push(`Average cadence was ${cadenceAvg.firstHalf} on the first half, and ${cadenceAvg.secondHalf} on the second half.`)
                } else if (activity.cadenceAvg > 0) {
                    messages.push(`Average cadence was ${activity.cadenceAvg}.`)
                }
            }

            // Add weather data?
            const activityWeather = options.activityWeather
            if (activityWeather && (activityWeather.mid?.summary || activityWeather.start?.summary || activityWeather.end?.summary)) {
                const weatherText = activityWeather.mid?.summary || activityWeather.start?.summary || activityWeather.end?.summary
                messages.push(`The weather was ${weatherText.toLowerCase()}, `)

                const weatherTemps = _.without([activityWeather.mid?.temperature || activityWeather.start?.temperature || activityWeather.end?.temperature], null, undefined)
                const tempUnit = user.preferences.weatherUnit == "f" ? "°F" : "°C"
                const minTemp = _.min(weatherTemps) || 0
                const maxTemp = _.max(weatherTemps) || 0
                const windSpeeds = _.compact([activityWeather.mid?.windSpeed, activityWeather.start?.windSpeed, activityWeather.end?.windSpeed])
                const avgWind = Math.round(_.mean(windSpeeds)) || 0
                const windUnit = user.preferences.windSpeedUnit ? user.preferences.windSpeedUnit : user.preferences.weatherUnit == "f" ? "mph" : "kph"
                messages.push(`with temperatures from ${minTemp}${tempUnit} to ${maxTemp}${tempUnit}, and wind of ${avgWind} ${windUnit}.`)

                if (options.fullDetails) {
                    const weatherAqis = _.compact([activityWeather.mid?.aqi, activityWeather.start?.aqi, activityWeather.end?.aqi])
                    const weatherAqi = _.max(weatherAqis) || 0
                    if (weatherAqi > 4) {
                        messages.push("The air quality was extremely bad.")
                    } else if (weatherAqi > 3) {
                        messages.push("The air quality was bad.")
                    }
                }
            }
        } catch (ex) {
            logger.error("AI.getActivityPrompt", logHelper.user(user), logHelper.activity(activity), "Failure while building the prompt", ex)
        }

        return messages
    }

    /**
     * Get final messages to set the humour and translation for the prompt.
     * @param user The user.
     * @param options AI generation options.
     */
    private getHumourAndTranslation = (user: UserData, options: AiGenerateOptions): string[] => {
        const messages = []

        // If user has a custom prompt, use it, otherwise fallback to the selected humour.
        if (user.preferences.aiPrompt) {
            messages.push(user.preferences.aiPrompt)
        } else if (options.humour) {
            const humour = options.humour || _.sample(settings.ai.humours)
            if (humour != "none") {
                messages.push(`Please be very ${humour} with the choice of words.`)
            }
        }

        // Translate to the user's language (if other than English).
        if (user.preferences.language && user.preferences.language != "en") {
            const languageName = translation("LanguageName", user.preferences)
            messages.push(`The answer should be translated to ${languageName}.`)
        }

        return messages
    }
}

// Exports...
export default AI.Instance
