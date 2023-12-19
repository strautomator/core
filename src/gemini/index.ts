// Strautomator Core: Gemini (Vertex AI)

import {AiProvider} from "../ai/types"
import {StravaActivity} from "../strava/types"
import {UserData} from "../users/types"
import {GenerateContentRequest, VertexAI} from "@google-cloud/vertexai"
import _ from "lodash"
import Bottleneck from "bottleneck"
import logger from "anyhow"
import * as logHelper from "../loghelper"
const settings = require("setmeup").settings

/**
 * Gemini (Vertex AI) wrapper.
 */
export class Gemini implements AiProvider {
    private constructor() {}
    private static _instance: Gemini
    static get Instance() {
        return this._instance || (this._instance = new this())
    }

    /**
     * API limiter module.
     */
    private limiter: Bottleneck

    /**
     * The Vertex AI client, created on init().
     */
    client: VertexAI

    // INIT
    // --------------------------------------------------------------------------

    /**
     * Init the Gemini wrapper.
     */
    init = async (): Promise<void> => {
        try {
            this.client = new VertexAI({project: settings.gcp.projectId, location: "us-east4"})

            // Create the bottleneck rate limiter.
            this.limiter = new Bottleneck({
                maxConcurrent: settings.gemini.api.maxConcurrent,
                reservoir: settings.gemini.api.maxPerMinute,
                reservoirRefreshAmount: settings.gemini.api.maxPerMinute,
                reservoirRefreshInterval: 1000 * 60
            })

            // Rate limiter events.
            this.limiter.on("error", (err) => logger.error("Gemini.limiter", err))
            this.limiter.on("depleted", () => logger.warn("Gemini.limiter", "Rate limited"))
        } catch (ex) {
            logger.error("Gemini.init", ex)
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
            const model = this.client.preview.getGenerativeModel({model: "gemini-pro"})
            const parts = prompt.map((p) => ({text: p}))

            // Here we go!
            const reqOptions: GenerateContentRequest = {
                contents: [{role: "user", parts: parts}],
                generation_config: {
                    max_output_tokens: maxTokens
                }
            }
            const jobId = `gemini-activity-${activity.id}`
            const result = await this.limiter.schedule({id: jobId}, () => model.generateContent(reqOptions))

            // Validate and extract the generated activity name.
            const activityName = result.response?.candidates[0].content.parts[0]?.text
            if (activityName) {
                logger.info("Gemini.activityPrompt", logHelper.user(user), logHelper.activity(activity), activityName)
                return activityName
            }

            // Failed to generate the activity name.
            logger.warn("Gemini.activityPrompt", logHelper.user(user), logHelper.activity(activity), "Failed to generate")
            return null
        } catch (ex) {
            logger.error("Gemini.activityPrompt", logHelper.user(user), logHelper.activity(activity), ex)
        }
    }
}

// Exports...
export default Gemini.Instance
