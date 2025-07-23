// Strautomator Core: xAI (Grok)

import {AiGenerateOptions, AiProvider} from "../ai/types"
import {UserData} from "../users/types"
import {AxiosConfig, axiosRequest} from "../axios"
import _ from "lodash"
import Bottleneck from "bottleneck"
import logger from "anyhow"
import * as logHelper from "../loghelper"
const settings = require("setmeup").settings

/**
 * xAI (Grok) wrapper.
 */
export class xAI implements AiProvider {
    private constructor() {}
    private static _instance: xAI
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
     * Init the xAI wrapper.
     */
    init = async (): Promise<void> => {
        try {
            if (!settings.xai.api.key) {
                throw new Error("Missing the xai.api.key setting")
            }

            // Create the bottleneck rate limiter.
            this.limiter = new Bottleneck({
                maxConcurrent: settings.xai.api.maxConcurrent,
                reservoir: settings.xai.api.maxPerMinute,
                reservoirRefreshAmount: settings.xai.api.maxPerMinute,
                reservoirRefreshInterval: 1000 * 60
            })

            // Rate limiter events.
            this.limiter.on("error", (err) => logger.error("xAI.limiter", err))
            this.limiter.on("depleted", () => logger.warn("xAI.limiter", "Rate limited"))
        } catch (ex) {
            logger.error("xAI.init", ex)
        }
    }

    // METHODS
    // --------------------------------------------------------------------------

    /**
     * Dispatch a prompt to xAI.
     * @param user The user.
     * @param options AI generation options.
     * @param messages The messages to be sent to the assistant.
     */
    prompt = async (user: UserData, options: AiGenerateOptions, messages: string[]): Promise<string> => {
        try {
            const reqOptions: AxiosConfig = {
                url: `${settings.xai.api.baseUrl}chat/completions`,
                method: "POST",
                headers: {Authorization: `Bearer ${settings.xai.api.key}`},
                data: {
                    model: "grok-2",
                    max_tokens: options.maxTokens,
                    messages: [
                        {role: "system", content: options.instruction},
                        {role: "user", content: messages.join(" ")}
                    ]
                }
            }

            // Here we go!
            try {
                const result = await this.limiter.schedule(() => axiosRequest(reqOptions))

                // Successful prompt response? Extract the generated activity name.
                if (result?.choices?.length > 0) {
                    const content = _.compact(result.choices.map((c) => c.message?.content))
                    return content.join(" ")
                }
            } catch (innerEx) {
                logger.error("xAI.prompt", logHelper.user(user), options.subject, innerEx)
            }

            // Failed to generate the activity name.
            logger.warn("xAI.prompt", logHelper.user(user), options.subject, "Failed to generate")
            return null
        } catch (ex) {
            logger.error("xAI.prompt", logHelper.user(user), options.subject, ex)
            return null
        }
    }
}

// Exports...
export default xAI.Instance
