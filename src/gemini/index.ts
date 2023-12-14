// Strautomator Core: Gemini (Vertex AI)

import {StravaActivity} from "../strava/types"
import {UserData} from "../users/types"
import {VertexAI} from "@google-cloud/vertexai"
import _ from "lodash"
import logger from "anyhow"
import * as logHelper from "../loghelper"
import cache from "bitecache"
const settings = require("setmeup").settings

/**
 * Gemini (Vertex AI) wrapper.
 */
export class Gemini {
    private constructor() {}
    private static _instance: Gemini
    static get Instance() {
        return this._instance || (this._instance = new this())
    }

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

            cache.setup("gemini", settings.gemini.cacheDuration)
            logger.info("Gemini.init", `Cache prompt results for up to ${settings.gemini.cacheDuration} seconds`)
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
     * @param humour Optional humour to be used on the prompt.
     * @param weatherSummaries Optional weather for the start and end of the activity.
     */
    generateActivityName = async (user: UserData, activity: StravaActivity, prompt: string[]): Promise<string> => {
        try {
            const cacheId = `activity-${activity.id}`
            const fromCache = cache.get("gemini", cacheId)
            if (fromCache) {
                logger.info("OpenAI.generateActivityName", logHelper.user(user), logHelper.activity(activity), fromCache)
                return fromCache
            }

            // Prepare the model and request prompt.
            const model = this.client.preview.getGenerativeModel({model: "gemini-pro"})
            const parts = prompt.map((p) => ({text: p}))

            // Here we go!
            const result = await model.generateContent({
                contents: [{role: "user", parts: parts}],
                generation_config: {
                    max_output_tokens: settings.gemini.maxTokens
                }
            })

            // Validate and extract the generated activity name.
            const activityName = result.response?.candidates[0].content.parts[0]?.text
            if (activityName) {
                logger.info("Gemini.generateActivityName", logHelper.user(user), logHelper.activity(activity), result)
                return activityName
            }

            // Failed to generate the activity name.
            logger.warn("Gemini.generateActivityName", logHelper.user(user), logHelper.activity(activity), "Failed to generate")
            return null
        } catch (ex) {
            logger.error("Gemini.generateActivityName", logHelper.user(user), logHelper.activity(activity), ex)
        }
    }
}

// Exports...
export default Gemini.Instance
