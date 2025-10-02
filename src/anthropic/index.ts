// Strautomator Core: Anthropic (Claude)

import {AiGenerateOptions, AiProvider} from "../ai/types"
import {UserData} from "../users/types"
import {AxiosConfig, axiosRequest} from "../axios"
import _ from "lodash"
import Bottleneck from "bottleneck"
import logger from "anyhow"
import * as logHelper from "../loghelper"
const settings = require("setmeup").settings

/**
 * Anthropic (Claude) wrapper.
 */
export class Anthropic implements AiProvider {
    private constructor() {}
    private static _instance: Anthropic
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
     * Init the Anthropic wrapper.
     */
    init = async (): Promise<void> => {
        try {
            if (!settings.anthropic.api.key) {
                throw new Error("Missing the anthropic.api.key setting")
            }

            // Create the bottleneck rate limiter.
            this.limiter = new Bottleneck({
                maxConcurrent: settings.anthropic.api.maxConcurrent,
                reservoir: settings.anthropic.api.maxPerMinute,
                reservoirRefreshAmount: settings.anthropic.api.maxPerMinute,
                reservoirRefreshInterval: 1000 * 60
            })

            // Rate limiter events.
            this.limiter.on("error", (err) => logger.error("Anthropic.limiter", err))
            this.limiter.on("depleted", () => logger.warn("Anthropic.limiter", "Rate limited"))
        } catch (ex) {
            logger.error("Anthropic.init", ex)
        }
    }

    // METHODS
    // --------------------------------------------------------------------------

    /**
     * Dispatch a prompt to Anthropic.
     * @param user The user.
     * @param options AI generation options.
     * @param messages The messages to be sent to the assistant.
     */
    prompt = async (user: UserData, options: AiGenerateOptions, messages: string[]): Promise<string> => {
        try {
            const reqOptions: AxiosConfig = {
                url: `${settings.anthropic.api.baseUrl}messages`,
                method: "POST",
                headers: {},
                data: {
                    model: user.isPro ? "claude-sonnet-4-5" : "claude-3-5-haiku-latest",
                    max_tokens: options.maxTokens,
                    system: options.instruction,
                    messages: [{role: "user", content: messages.join(" ")}]
                }
            }
            reqOptions.headers["anthropic-version"] = settings.anthropic.api.version
            reqOptions.headers["x-api-key"] = settings.anthropic.api.key

            // Here we go!
            try {
                const result = await this.limiter.schedule(() => axiosRequest(reqOptions))

                // Successful prompt response? Extract the generated activity name.
                if (result?.content?.length > 0) {
                    const content = result.content.filter((c) => c.type == "text").map((c) => c.text)
                    return content.join(" ")
                }
            } catch (innerEx) {
                logger.error("Anthropic.prompt", logHelper.user(user), options.subject, innerEx)
            }

            // Failed to generate the activity name.
            logger.warn("Anthropic.prompt", logHelper.user(user), options.subject, "Failed to generate")
            return null
        } catch (ex) {
            logger.error("Anthropic.prompt", logHelper.user(user), options.subject, ex)
            return null
        }
    }
}

// Exports...
export default Anthropic.Instance
