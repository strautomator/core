// Strautomator Core: OpenAI (ChatGPT)

import {AiGenerateOptions, AiProvider} from "../ai/types"
import {UserData} from "../users/types"
import {AxiosConfig, axiosRequest} from "../axios"
import _ from "lodash"
import Bottleneck from "bottleneck"
import logger from "anyhow"
import * as logHelper from "../loghelper"
const settings = require("setmeup").settings

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
                maxConcurrent: settings.openai.api.maxConcurrent,
                reservoir: settings.openai.api.maxPerMinute,
                reservoirRefreshAmount: settings.openai.api.maxPerMinute,
                reservoirRefreshInterval: 1000 * 60
            })

            // Rate limiter events.
            this.limiter.on("error", (err) => logger.error("OpenAI.limiter", err))
            this.limiter.on("depleted", () => logger.warn("OpenAI.limiter", "Rate limited"))
        } catch (ex) {
            logger.error("OpenAI.init", ex)
        }
    }

    /**
     * Helper to extract an underlying error from OpenAI client exceptions.
     * @param ex The error or exception object.
     */
    get baseHeaders() {
        return {Authorization: `Bearer ${settings.openai.api.key}`}
    }

    // GENERAL PROMPTING
    // --------------------------------------------------------------------------

    /**
     * Dispatch a prompt to OpenAI.
     * @param user The user.
     * @param options AI generation options.
     * @param messages The messages to be sent.
     */
    prompt = async (user: UserData, options: AiGenerateOptions, messages: string[]): Promise<string> => {
        try {
            const reqOptions: AxiosConfig = {
                url: `${settings.openai.api.baseUrl}responses`,
                method: "POST",
                headers: this.baseHeaders,
                data: {
                    model: user.isPro && options.useReason ? "gpt-5.6-terra" : "gpt-5.6-luna",
                    reasoning: {effort: options.useReason ? "low" : "none"},
                    max_output_tokens: options.maxTokens,
                    instructions: options.instruction,
                    input: messages.join(" "),
                    truncation: "auto"
                }
            }

            // Here we go!
            try {
                let result = await this.limiter.schedule(() => axiosRequest(reqOptions))

                // If the response is not yet complete, poll until it is (up to 3 retries).
                if (result?.id && result.status === "incomplete") {
                    logger.warn("OpenAI.prompt", logHelper.user(user), options.subject, `Not completed yet, trying again: ${result.id}`)

                    const retryOptions: AxiosConfig = {
                        url: `${settings.openai.api.baseUrl}responses/${result.id}`,
                        method: "GET",
                        headers: this.baseHeaders
                    }
                    await new Promise((resolve) => setTimeout(resolve, settings.axios.retryInterval))
                    result = await this.limiter.schedule(() => axiosRequest(retryOptions))
                }

                // Only extract content if the response completed successfully.
                if (result?.status === "completed" && result?.output?.length > 0) {
                    const message = result.output.find((o) => o.type === "message")
                    const content = message?.content?.find((c) => c.type === "output_text")
                    if (content?.text) {
                        const arrName = content.text.split(`"`)
                        let text = arrName.length > 1 ? arrName[1] : arrName[0]
                        return text
                    }
                }

                if (result?.status && result.status !== "completed") {
                    logger.warn("OpenAI.prompt", logHelper.user(user), options.subject, `Response status: ${result.status}`)
                }
            } catch (innerEx) {
                logger.error("OpenAI.prompt", logHelper.user(user), options.subject, innerEx)
            }

            // Failed to generate the activity name.
            logger.warn("OpenAI.prompt", logHelper.user(user), options.subject, "Failed to generate")
            return null
        } catch (ex) {
            logger.error("OpenAI.prompt", logHelper.user(user), options.subject, ex)
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
                headers: this.baseHeaders,
                data: {input: prompt}
            }

            // Stop if no results were returned, or if nothing was flagged.
            const result = await this.limiter.schedule(() => axiosRequest(options))
            if (!result) {
                return null
            }
            const flagged = result.results.find((r) => r.flagged)
            if (!flagged) {
                return null
            }

            // Return list of categories that failed the moderation.
            const categories = Object.keys(_.pickBy(flagged.categories, (i) => i == true))
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
