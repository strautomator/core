// Strautomator Core: Anthropic (Claude)

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
                url: `${settings.anthropic.api.baseUrl}messages`,
                method: "POST",
                headers: {},
                data: {
                    model: "claude-3-5-sonnet-20240620",
                    max_tokens: maxTokens,
                    system: "You are an assistant to create creative names and descriptions for Strava activities.",
                    messages: [{role: "user", content: content}]
                }
            }

            // Append headers.
            options.headers["anthropic-version"] = settings.anthropic.api.version
            options.headers["x-api-key"] = settings.anthropic.api.key
            options.headers["User-Agent"] = `${settings.app.title} / ${packageVersion}`

            logger.debug("Anthropic.activityPrompt", logHelper.user(user), logHelper.activity(activity), `Prompt: ${content}`)

            // Here we go!
            try {
                const jobId = `${activity.id}-${prompt.length}-${maxTokens}`
                const result = await this.limiter.schedule({id: jobId}, () => axiosRequest(options))

                // Successful prompt response? Extract the generated activity name.
                if (result?.content?.length > 0) {
                    const content = result.content.filter((c) => c.type == "text").map((c) => c.text)
                    return content.join(" ")
                }
            } catch (innerEx) {
                logger.error("Anthropic.activityPrompt", logHelper.user(user), logHelper.activity(activity), options.data.model, innerEx)
            }

            // Failed to generate the activity name.
            logger.warn("Anthropic.activityPrompt", logHelper.user(user), logHelper.activity(activity), "Failed to generate")
            return null
        } catch (ex) {
            logger.error("Anthropic.activityPrompt", logHelper.user(user), logHelper.activity(activity), ex)
            return null
        }
    }
}

// Exports...
export default Anthropic.Instance
