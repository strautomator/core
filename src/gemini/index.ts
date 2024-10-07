// Strautomator Core: Gemini (Vertex AI)

import {AiGenerateOptions, AiProvider} from "../ai/types"
import {UserData} from "../users/types"
import {FinishReason, GenerateContentRequest, HarmBlockThreshold, HarmCategory, VertexAI} from "@google-cloud/vertexai"
import {PredictionServiceClient} from "@google-cloud/aiplatform"
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
     * The Vertex AI client, created on init().
     */
    client: VertexAI

    /**
     * Image generation client.
     */
    predictionClient: PredictionServiceClient

    // INIT
    // --------------------------------------------------------------------------

    /**
     * Init the Gemini wrapper.
     */
    init = async (): Promise<void> => {
        try {
            this.client = new VertexAI({project: settings.gcp.projectId, location: "us-east4"})
            this.predictionClient = new PredictionServiceClient({projectId: settings.gcp.projectId, apiEndpoint: "us-east4-aiplatform.googleapis.com"})

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
     * @param messages The messages to be sent to the assistant.
     */
    prompt = async (user: UserData, options: AiGenerateOptions, messages: string[]): Promise<string> => {
        try {
            const model = this.client.preview.getGenerativeModel({model: user.isPro && Math.random() < 0.5 ? "gemini-1.5-flash" : "gemini-1.0-pro"})
            const reqOptions: GenerateContentRequest = {
                contents: [{role: "user", parts: messages.map((p) => ({text: p}))}],
                safetySettings: [
                    {category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH},
                    {category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH},
                    {category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH},
                    {category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH}
                ],
                generationConfig: {
                    maxOutputTokens: options.maxTokens
                }
            }

            // Helper to validate and extract the text from the response.
            const parseResponse = async (response) => {
                if (!response) {
                    throw new Error("Response is missing")
                }
                if (!response.candidates?.length) {
                    throw new Error(`Response is missing a candidate: ${JSON.stringify(result.response, null, 0)}`)
                }
                const candidate = response.candidates[0]
                if (!candidate.content.parts?.length) {
                    throw new Error(`Response is missing the content part: ${JSON.stringify(result.response, null, 0)}`)
                }
                return candidate.content.parts[0].text
            }

            // Here we go!
            let result = await this.limiter.schedule(() => model.generateContent(reqOptions))
            let text = parseResponse(result ? result.response : null)

            // If the response was cut due to insufficient tokens and the user is PRO, try again with a higher limit.
            if (result?.response.candidates[0]?.finishReason === FinishReason.MAX_TOKENS) {
                logger.warn("Gemini.prompt", logHelper.user(user), options.subject, "Early stop due to max tokens, will retry", text)

                if (user.isPro) {
                    reqOptions.generationConfig.maxOutputTokens = Math.round(options.maxTokens * settings.ai.maxTokens.multiplier)
                    result = await this.limiter.schedule(() => model.generateContent(reqOptions))
                    text = parseResponse(result ? result.response : null)
                }
            }

            // Extract the generated text.
            if (text) {
                logger.info("Gemini.prompt", logHelper.user(user), options.subject, text)
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
