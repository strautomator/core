// Strautomator Core: Mistral AI (Le Chat)

import {AiGenerateOptions, AiProvider} from "../ai/types"
import {UserData} from "../users/types"
import {AxiosConfig, axiosRequest} from "../axios"
import _ from "lodash"
import Bottleneck from "bottleneck"
import logger from "anyhow"
import * as logHelper from "../loghelper"
const settings = require("setmeup").settings
const packageVersion = require("../../package.json").version

/**
 * Mistral AI (Le Chat) wrapper.
 */
export class Mistral implements AiProvider {
    private constructor() {}
    private static _instance: Mistral
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
     * Init the Mistral wrapper.
     */
    init = async (): Promise<void> => {
        try {
            if (!settings.mistral.api.key) {
                throw new Error("Missing the mistral.api.key setting")
            }

            // Create the bottleneck rate limiter.
            this.limiter = new Bottleneck({
                maxConcurrent: settings.mistral.api.maxConcurrent,
                reservoir: settings.mistral.api.maxPerMinute,
                reservoirRefreshAmount: settings.mistral.api.maxPerMinute,
                reservoirRefreshInterval: 1000 * 60
            })

            // Rate limiter events.
            this.limiter.on("error", (err) => logger.error("Mistral.limiter", err))
            this.limiter.on("depleted", () => logger.warn("Mistral.limiter", "Rate limited"))
        } catch (ex) {
            logger.error("Mistral.init", ex)
        }
    }

    // METHODS
    // --------------------------------------------------------------------------

    /**
     * Dispatch a prompt to Mistral.
     * @param user The user.
     * @param options AI generation options.
     * @param messages The messages to be sent to the assistant.
     */
    prompt = async (user: UserData, options: AiGenerateOptions, messages: string[]): Promise<string> => {
        try {
            const reqOptions: AxiosConfig = {
                url: `${settings.mistral.api.baseUrl}chat/completions`,
                method: "POST",
                headers: {},
                data: {
                    model: "mistral-small-latest",
                    max_tokens: options.maxTokens,
                    messages: [
                        {role: "system", content: options.instruction},
                        {role: "user", content: messages.join(" ")}
                    ]
                }
            }
            reqOptions.headers["Authorization"] = `Bearer ${settings.mistral.api.key}`
            reqOptions.headers["User-Agent"] = `${settings.app.title} / ${packageVersion}`

            // Here we go!
            try {
                const result = await this.limiter.schedule(() => axiosRequest(reqOptions))

                // Successful prompt response? Extract the generated activity name.
                if (result?.choices?.length > 0) {
                    const content = _.compact(result.choices.map((c) => c.message?.content))
                    return content.join(" ")
                }
            } catch (innerEx) {
                logger.error("Mistral.prompt", logHelper.user(user), options.subject, innerEx)
            }

            // Failed to generate the activity name.
            logger.warn("Mistral.prompt", logHelper.user(user), options.subject, "Failed to generate")
            return null
        } catch (ex) {
            logger.error("Mistral.prompt", logHelper.user(user), options.subject, ex)
            return null
        }
    }
}

// Exports...
export default Mistral.Instance
