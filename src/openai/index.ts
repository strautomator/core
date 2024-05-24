// Strautomator Core: OpenAI (ChatGPT)

import {AiProvider} from "../ai/types"
import {StravaActivity} from "../strava/types"
import {UserData} from "../users/types"
import {AxiosConfig, axiosRequest} from "../axios"
import _ from "lodash"
import Bottleneck from "bottleneck"
import logger from "anyhow"
import * as logHelper from "../loghelper"
const settings = require("setmeup").settings
const packageVersion = require("../../package.json").version

/**
 * OpenAI (ChatGPT) wrapper.
 */
export class OpenAI implements AiProvider {
    private constructor() {}
    private static _instance: OpenAI
    static get Instance() {
        return this._instance || (this._instance = new this())
    }

    /**
     * API limiter module.
     */
    limiter: Bottleneck

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

            // Create the bottleneck rate limiter.
            this.limiter = new Bottleneck({
                maxConcurrent: settings.anthropic.api.maxConcurrent,
                reservoir: settings.anthropic.api.maxPerMinute,
                reservoirRefreshAmount: settings.anthropic.api.maxPerMinute,
                reservoirRefreshInterval: 1000 * 60
            })

            // Rate limiter events.
            this.limiter.on("error", (err) => logger.error("OpenAI.limiter", err))
            this.limiter.on("depleted", () => logger.warn("OpenAI.limiter", "Rate limited"))
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
     * @param prompt Prompt to be used.
     * @param maxTokens Max tokens to be used.
     */
    activityPrompt = async (user: UserData, activity: StravaActivity, prompt: string[], maxTokens: number): Promise<string> => {
        try {
            const content = prompt.join(" ")
            const options: AxiosConfig = {
                url: `${settings.openai.api.baseUrl}chat/completions`,
                method: "POST",
                headers: {},
                data: {
                    model: user.isPro && Math.random() < 0.5 ? "gpt-4o" : "gpt-3.5-turbo",
                    max_tokens: maxTokens,
                    messages: [
                        {role: "system", content: "You are an assistant to create creative names and descriptions for Strava activities."},
                        {role: "user", content: content}
                    ]
                },
                onRetry: (opt) => {
                    if (user.isPro) {
                        opt.data.model = "gpt-3.5-turbo"
                        return true
                    }
                    return false
                }
            }

            // Append headers.
            options.headers["Authorization"] = `Bearer ${settings.openai.api.key}`
            options.headers["User-Agent"] = `${settings.app.title} / ${packageVersion}`

            logger.debug("OpenAI.activityPrompt", logHelper.user(user), logHelper.activity(activity), `Prompt: ${content}`)

            // Here we go!
            try {
                const jobId = `${activity.id}-${prompt.length}-${maxTokens}`
                const result = await this.limiter.schedule({id: jobId}, () => axiosRequest(options))

                // Successful prompt response? Extract the generated activity name.
                if (result?.choices?.length > 0) {
                    const arrName = result.choices[0].message.content.split(`"`)
                    let text = arrName.length > 1 ? arrName[1] : arrName[0]

                    // Ends with a period, but has no question? Remove it.
                    if (text.substring(text.length - 1) == "." && !text.includes("?")) {
                        text = text.substring(0, text.length - 1).trim()
                    } else {
                        text = text.trim()
                    }

                    return text
                }
            } catch (innerEx) {
                logger.error("OpenAI.activityPrompt", logHelper.user(user), logHelper.activity(activity), options.data.model, innerEx)
            }

            // Failed to generate the activity name.
            logger.warn("OpenAI.activityPrompt", logHelper.user(user), logHelper.activity(activity), "Failed to generate")
            return null
        } catch (ex) {
            logger.error("OpenAI.activityPrompt", logHelper.user(user), logHelper.activity(activity), ex)
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
