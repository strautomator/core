// Strautomator Core: Gemini (Vertex AI)

import {AiGenerateOptions, AiProvider} from "../ai/types"
import {UserData} from "../users/types"
import {GoogleGenAI, FinishReason, HarmBlockThreshold, HarmCategory, GenerateContentParameters} from "@google/genai"
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
    limiter: Bottleneck

    /**
     * The GoogleGenAI client, created on init().
     */
    client: GoogleGenAI

    // INIT
    // --------------------------------------------------------------------------

    /**
     * Init the Gemini wrapper.
     */
    init = async (): Promise<void> => {
        try {
            this.client = new GoogleGenAI({vertexai: true, apiVersion: "v1", project: settings.gcp.projectId, location: "europe-west4"})

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
     * Dispatch a prompt to Gemini.
     * @param user The user.
     * @param options AI generation options.
     * @param messages The messages to be sent.
     */
    prompt = async (user: UserData, options: AiGenerateOptions, messages: string[]): Promise<string> => {
        try {
            const reqOptions: GenerateContentParameters = {
                model: user.isPro && options.useReason ? "gemini-3-flash-preview" : "gemini-2.5-flash-lite",
                contents: [{role: "user", parts: messages.map((p) => ({text: p}))}],
                config: {
                    safetySettings: [
                        {category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH},
                        {category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH},
                        {category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH},
                        {category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH}
                    ]
                }
            }

            // Helper to validate and extract the text from the response.
            const parseResponse = async (response) => {
                if (!response) {
                    throw new Error("Response is missing")
                }
                if (!response.candidates?.length) {
                    throw new Error(`Response is missing a candidate: ${JSON.stringify(result, null, 0)}`)
                }
                const candidate = response.candidates[0]
                if (!candidate.content.parts?.length) {
                    throw new Error(`Response is missing the content part: ${JSON.stringify(result, null, 0)}`)
                }
                return candidate.content.parts[0].text
            }

            // Here we go!
            let result = await this.limiter.schedule(() => this.client.models.generateContent(reqOptions))
            let text = parseResponse(result)

            // If the response was cut due to insufficient tokens and the user is PRO, try again with a higher limit.
            if (result?.candidates[0]?.finishReason === FinishReason.MAX_TOKENS) {
                logger.warn("Gemini.prompt", logHelper.user(user), options.subject, "Early stop due to max tokens, will retry", text)

                if (user.isPro) {
                    reqOptions.config.maxOutputTokens = Math.round(options.maxTokens * settings.ai.maxTokens.multiplier)
                    result = await this.limiter.schedule(() => this.client.models.generateContent(reqOptions))
                    text = parseResponse(result)
                }
            }

            // Extract the generated text.
            if (text) {
                return text
            }

            // Failed to generate the activity name.
            logger.warn("Gemini.prompt", logHelper.user(user), options.subject, "Failed to generate")
            return null
        } catch (ex) {
            logger.error("Gemini.prompt", logHelper.user(user), options.subject, ex)

            // Force trigger a rate limit in case we get a "quota exceeded" error.
            const message = JSON.stringify(ex, null, 0)
            if (message.includes("429") && message.includes("quota")) {
                const remaining = await this.limiter.currentReservoir()
                this.limiter.incrementReservoir(-remaining)
            }

            return null
        }
    }
}

// Exports...
export default Gemini.Instance
