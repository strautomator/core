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
                    model: user.isPro && options.useReason ? "gpt-5-mini" : "gpt-5-nano",
                    reasoning: {effort: options.useReason ? "low" : "minimal"},
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

    // ASSISTANT
    // --------------------------------------------------------------------------

    /**
     * Creates a thread to starting messaging with the AI assistant.
     * @param user The user data.
     */
    createThread = async (user: UserData): Promise<string> => {
        try {
            if (!user.isPro) {
                throw new Error("AI assistant is only available for PRO users")
            }

            const options: AxiosConfig = {
                url: `${settings.openai.api.baseUrl}threads`,
                method: "POST",
                headers: this.baseHeaders,
                data: {metadata: {userId: user.id}}
            }

            const result = await this.limiter.schedule(() => axiosRequest(options))
            if (!result || !result.id) {
                logger.warn("OpenAI.createThread", logHelper.user(user), "Failed to create the thread")
                return null
            }

            logger.info("OpenAI.createThread", logHelper.user(user), result.id)
            return result.id
        } catch (ex) {
            logger.error("OpenAI.createThread", logHelper.user(user), ex)
            return null
        }
    }

    /**
     * Deletes a thread with the AI assistant. Returns true if a thread was deleted.
     * @param user The user data.
     * @param threadId The thread to be deleted.
     */
    deleteThread = async (user: UserData, threadId: string): Promise<boolean> => {
        try {
            const options: AxiosConfig = {
                url: `${settings.openai.api.baseUrl}threads/${threadId}`,
                method: "DELETE",
                headers: this.baseHeaders
            }

            const result = await this.limiter.schedule(() => axiosRequest(options))
            if (!result || !result.deleted) {
                logger.warn("OpenAI.deleteThread", logHelper.user(user), threadId, "Invalid or missing thread")
                return false
            }

            logger.info("OpenAI.deleteThread", logHelper.user(user), threadId)
            return true
        } catch (ex) {
            logger.error("OpenAI.deleteThread", logHelper.user(user), threadId, ex)
            return false
        }
    }

    /**
     * Run the specified thread and return the run ID.
     * @param user The user data.
     * @param threadId The thread to run.
     * @param messages The messages to be sent to the assistant.
     */
    runThread = async (user: UserData, threadId: string, messages: string[]): Promise<string> => {
        try {
            const options: AxiosConfig = {
                url: `${settings.openai.api.baseUrl}threads/${threadId}/runs`,
                method: "POST",
                headers: this.baseHeaders,
                data: {assistant_id: settings.openai.api.assistantId, additional_messages: messages.map((m) => ({role: "user", content: m}))}
            }

            const result = await axiosRequest(options)
            if (!result || !result.id) {
                logger.warn("OpenAI.runThread", logHelper.user(user), threadId, "Failed to run the thread")
                return null
            }

            logger.info("OpenAI.runThread", logHelper.user(user), threadId, `Run: ${result.id}`)
            return result.id
        } catch (ex) {
            logger.error("OpenAI.runThread", logHelper.user(user), threadId, ex)
            return null
        }
    }
}

// Exports...
export default OpenAI.Instance
