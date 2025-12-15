// Strautomator Core: OpenRouter

import {AiGenerateOptions, AiProvider} from "../ai/types"
import {UserData} from "../users/types"
import {AxiosConfig, axiosRequest} from "../axios"
import _ from "lodash"
import Bottleneck from "bottleneck"
import logger from "anyhow"
import * as logHelper from "../loghelper"
const settings = require("setmeup").settings

/**
 * OpenRouter AI wrapper.
 */
export class OpenRouter implements AiProvider {
    private constructor() {}
    private static _instance: OpenRouter
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
     * Init the OpenRouter wrapper.
     */
    init = async (): Promise<void> => {
        try {
            if (!settings.openrouter.api.key) {
                throw new Error("Missing the openrouter.api.key setting")
            }

            // Create the bottleneck rate limiter.
            this.limiter = new Bottleneck({
                maxConcurrent: settings.openrouter.api.maxConcurrent,
                reservoir: settings.openrouter.api.maxPerMinute,
                reservoirRefreshAmount: settings.openrouter.api.maxPerMinute,
                reservoirRefreshInterval: 1000 * 60
            })

            // Rate limiter events.
            this.limiter.on("error", (err) => logger.error("OpenRouter.limiter", err))
            this.limiter.on("depleted", () => logger.warn("OpenRouter.limiter", "Rate limited"))
        } catch (ex) {
            logger.error("OpenRouter.init", ex)
        }
    }

    // METHODS
    // --------------------------------------------------------------------------

    /**
     * Dispatch a prompt to OpenRouter.
     * @param user The user.
     * @param options AI generation options.
     * @param messages The messages to be sent to the assistant.
     */
    prompt = async (user: UserData, options: AiGenerateOptions, messages: string[]): Promise<string> => {
        try {
            const reqOptions: AxiosConfig = {
                url: `${settings.openrouter.api.baseUrl}chat/completions`,
                method: "POST",
                headers: {Authorization: `Bearer ${settings.openrouter.api.key}`},
                data: {
                    models: ["mistralai/mistral-small-3.1-24b-instruct:free", "google/gemini-2.0-flash-exp:free", "openai/gpt-5-nano"],
                    max_tokens: options.maxTokens,
                    stream: false,
                    messages: [
                        {role: "system", content: options.instruction},
                        {role: "user", content: messages.join(" ")}
                    ]
                }
            }

            // Here we go!
            try {
                const result = await this.limiter.schedule(() => axiosRequest(reqOptions))

                // Successful prompt response? Extract the generated content.
                if (result?.choices?.length > 0) {
                    const content = _.compact(result.choices.map((c) => c.message?.content || c.text))
                    return content.join(" ")
                }
            } catch (innerEx) {
                logger.error("OpenRouter.prompt", logHelper.user(user), options.subject, innerEx)
            }

            // Failed to generate the activity name.
            logger.warn("OpenRouter.prompt", logHelper.user(user), options.subject, "Failed to generate")
            return null
        } catch (ex) {
            logger.error("OpenRouter.prompt", logHelper.user(user), options.subject, ex)
            return null
        }
    }
}

// Exports...
export default OpenRouter.Instance
