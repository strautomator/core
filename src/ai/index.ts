// Strautomator Core: AI / LLM

import {AiGenerateOptions, AiGeneratedResponse, AiProvider} from "./types"
import {calculatePowerIntervals} from "../strava/utils"
import {UserData} from "../users/types"
import {translation} from "../translations"
import anthropic from "../anthropic"
import gemini from "../gemini"
import mistral from "../mistral"
import openai from "../openai"
import xai from "../xai"
import database from "../database"
import _ from "lodash"
import cache from "bitecache"
import logger from "anyhow"
import dayjs from "../dayjs"
import * as logHelper from "../loghelper"
const settings = require("setmeup").settings
const allProviders = [anthropic, xai, openai, gemini, mistral]

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
     * Gets all AI responses cached in the database for the specified user.
     * @param user The user.
     * @param responseType Filter by response type.
     * @param count If true, will return the count of cached responses instead.
     */
    getCachedResponses = async (user: UserData, responseType?: string, count?: boolean): Promise<AiGeneratedResponse[] | number> => {
        try {
            const where = [["userId", "==", user.id]]
            if (responseType) {
                where.push(["responseType", "==", responseType])
            }
            const result: any = count ? await database.count("ai", where) : await database.search("ai", where)

            logger.info("AI.getCachedResponses", logHelper.user(user), count ? `Count ${result}` : `Got ${result.length} cached responnses`)
            return result
        } catch (ex) {
            logger.error("AI.getCachedResponses", logHelper.user(user), ex)
            throw ex
        }
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
            options.useReason = true
            options.maxTokens = settings.ai.maxTokens.insights
            options.instruction = [
                "You are a sports coach that analyzes cycling and running workouts, and give short, to-the-point suggestions to improve performance.",
                "If weather data is provided, consider that temperature and wind can affect the speed and power output.",
                `You can give very technical answers.`
            ].join("")

            // At the moment this is enabled for moving activities with at least HR or power data.
            const activity = options.activity
            if (!activity || !activity.sportType || !activity.distance || !activity.movingTime || (!activity.wattsAvg && !activity.hrAvg)) {
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
            const messages = ["Please give me some important metrics about my activity performance."]

            // Recent activities were passed? Use them for context. At the moment we only use activities that have at least power or HR data.
            if (options.recentActivities?.length > 0 && options.fullDetails) {
                messages.push("First I will give you some details about my previous activities.")

                for (let a of options.recentActivities) {
                    if (!a.sportType) continue

                    const isRide = a.sportType.includes("Ride")
                    const isRun = a.sportType.includes("Run")
                    const sameType = isRide ? activity.sportType.includes("Ride") : isRun ? activity.sportType.includes("Run") : false

                    // Make sure we only use activities of the same type and the recent activity
                    // has the minimum necessary data for the prompt.
                    if (a.id == options.activity.id || !sameType || (!a.movingTime && !a.wattsAvg && !a.hrAvg)) {
                        continue
                    }

                    const subPrompt = []
                    const days = now.diff(a.dateStart, "days")
                    const duration = dayjs.duration(activity.movingTime, "seconds").format("HH:mm:ss")
                    subPrompt.push(`I ${this.getSportVerb(a.sportType, "past")} ${a.distance} ${a.distanceUnit || "km"} ${days} days ago in ${duration}, with an elevation gain of ${a.elevationGain || 0}${a.elevationUnit}`)

                    if (a.tss > 0) subPrompt.push(`, a TSS of ${a.tss}`)
                    if (a.wattsAvg > 0) subPrompt.push(`, average power of ${a.wattsAvg} watts and maximum ${a.wattsMax} watts`)
                    if (a.hrAvg > 0) subPrompt.push(`, average heart rate of ${a.hrAvg} BPM and maximum ${a.hrMax} BPM`)
                    if (a.cadenceAvg > 0) subPrompt.push(`, average cadence of ${isRide ? a.cadenceAvg + "RPM" : a.cadenceAvg * 2 + " SPM"}`)
                    if (a.weatherSummary && !a.sportType.includes("Virtual")) subPrompt.push(`, and weather was ${a.weatherSummary.toLowerCase()}`)
                    messages.push(subPrompt.join("") + ".")
                }

                messages.push("Now I will tell about my most recent activity.")
            }

            // Get the activity prompt and add final instructions.
            messages.push(...this.getActivityPrompt(user, options))
            messages.push("Your analysis should be two sentences, the first one explaining why my performance was good or bad compared to previous performances, and a second suggesting what I could do to improve, and when I should train again.")
            messages.push("If weather could have played a major factor, please tell me how it affected my performance (for example, heart rate might be too elevated in hot conditions, or speed might decrease a bit when it's too cold).")

            const athleteLevel = !user.fitnessLevel || user.fitnessLevel <= 2 ? "a beginner" : user.fitnessLevel <= 4 ? "an average" : "a pro"
            messages.push(`If my performance has been consistently getting worse, please verify if it could be due to sickness or overtraining at the current season, also considering that I'm ${athleteLevel} athlete.`)
            messages.push(...this.getHumourAndTranslation(user, options))

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

    // PROMPTS
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
        const providers = allProviders.filter(async (p: AiProvider) => (await p.limiter.currentReservoir()) > 0)
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
                provider = providers.length > 0 ? providers.pop() : null
            }
        }

        // Got a valid response?
        if (response) {
            const result = {
                userId: user.id,
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
                messages.push(`I ${this.getSportVerb(activity.sportType, "past")} ${activity.distance}${activity.distanceUnit} in ${activity.movingTimeString}.`)
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

            // Add weather data? Skip if the activity was virtual.
            if (!activity.trainer && !activity.sportType.includes("Virtual")) {
                const activityWeather = options.activityWeather
                if (activityWeather && (activityWeather.mid?.summary || activityWeather.start?.summary || activityWeather.end?.summary)) {
                    const weatherText = activityWeather.mid?.summary || activityWeather.start?.summary || activityWeather.end?.summary
                    messages.push(`The weather was ${weatherText.toLowerCase()}, `)

                    const weatherTemps = _.without([activityWeather.mid?.temperature || activityWeather.start?.temperature || activityWeather.end?.temperature], null, undefined)
                    const minTemp = _.min(weatherTemps) || 0
                    const maxTemp = _.max(weatherTemps) || 0
                    const windSpeeds = _.compact([activityWeather.mid?.windSpeed, activityWeather.start?.windSpeed, activityWeather.end?.windSpeed])
                    const avgWind = Math.round(_.mean(windSpeeds)) || 0
                    messages.push(`with temperatures from ${minTemp} to ${maxTemp}, and wind of ${avgWind}.`)

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
            }

            // Include additional people.
            if (activity.athleteCount > 2) {
                messages.push(`There were ${activity.athleteCount - 1} people ${this.getSportVerb(activity.sportType, "present")} with me.`)
            } else if (activity.athleteCount == 2) {
                messages.push(`There was another person ${this.getSportVerb(activity.sportType, "present")} with me.`)
            }
        } catch (ex) {
            logger.error("AI.getActivityPrompt", logHelper.user(user), logHelper.activity(activity), "Failure while building the prompt", ex)
        }

        return messages
    }

    // HELPERS
    // --------------------------------------------------------------------------

    /**
     * Helper to get the cache ID for the specified AI generation options.
     * @param options Provider, humourPrompt and activity details.
     */
    private getCacheId = (options: AiGenerateOptions): string => {
        return `${options.provider || "default"}-${options.humourPrompt || "random"}-${options.activity.id}`
    }

    /**
     * Get the right sport type verb.
     * @param sportType The activity sport.
     * @param time Present or past.
     */
    private getSportVerb = (sportType: string, time: "present" | "past"): string => {
        const value = sportType.replace(/([A-Z])/g, " $1").trim()
        if (time == "present") {
            return value.includes("ride") ? "cycling" : value.includes("run") ? "running" : "exercising"
        } else {
            return value.includes("ride") ? "cycled" : value.includes("run") ? "ran" : "did"
        }
    }

    /**
     * Get final messages to set the humour / custom prompt and translation.
     * @param user The user.
     * @param options AI generation options.
     */
    private getHumourAndTranslation = (user: UserData, options: AiGenerateOptions): string[] => {
        const messages = []

        // If a custom prompt was set, do not use predefined humours or translations.
        if (options.humourPrompt?.toString().startsWith("custom:")) {
            messages.push(options.humourPrompt.substring(7))
            return messages
        }

        // If we have recent activities, it means it's Insights do no need for humour.
        const humourPrompt = options.humourPrompt || _.sample(settings.ai.humours)
        if (!options.recentActivities && humourPrompt != "none") {
            messages.push(`Please be very ${humourPrompt} with the choice of words.`)
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
