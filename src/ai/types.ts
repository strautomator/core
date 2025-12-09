// Strautomator Core: AI types

import Bottleneck from "bottleneck"
import {StravaActivity, StravaActivityPerformance, StravaActivityStreams, StravaProcessedActivity} from "../strava/types"
import {UserData} from "../users/types"
import {ActivityWeather} from "../weather/types"

/**
 * Valid AI provider names.
 */
export enum AiProviderName {
    Anthropic = "anthropic",
    Gemini = "gemini",
    Mistral = "mistral",
    OpenAI = "openai",
    OpenRouter = "openrouter",
    xAI = "xai"
}

/**
 * AI provider interface.
 */
export interface AiProvider {
    /** Method to generate text. */
    prompt(user: UserData, options: AiGenerateOptions, messages: string[]): Promise<string>
    /** Method to generate an image. */
    imagePrompt?(user: UserData, options: AiGenerateOptions, messages: string[]): Promise<string | Buffer>
    /** Rate limiter. */
    limiter: Bottleneck
}

/**
 * AI LLM prompt and response data.
 */
export interface AiGeneratedResponse {
    /** User ID. */
    userId: string
    /** Which AI provider was used. */
    provider?: AiProviderName
    /** Prompt sent to the LLM. */
    prompt?: string
    /** Response from LLM, can be a string or raw buffer. */
    response?: string | Buffer
    /** Type of response. */
    responseType?: "image" | "text"
    /** Rate limiting flag (true if generation was not done due to rate limits). */
    rateLimited?: boolean
    /** Expiry date (used for TTL). */
    dateExpiry?: Date
}

/**
 * AI generation options.
 */
export interface AiGenerateOptions {
    /** AI provider. */
    provider?: AiProviderName
    /** Referenced activity. */
    activity?: StravaActivity
    /** Initial instruction to give to the AI. */
    instruction?: string
    /** Optional activity streams for a more detailed prompt. */
    activityStreams?: StravaActivityStreams
    /** Optional activity performance (power intervals). */
    activityPerformance?: StravaActivityPerformance
    /** Optional fresh weather details for the activity. */
    activityWeather?: ActivityWeather
    /** List of recent activities for added context. */
    recentActivities?: StravaProcessedActivity[]
    /** Use full activity details regardless of their relevancy. */
    fullDetails?: boolean
    /** Prefer a model that uses reason. */
    useReason?: boolean
    /** Max tokens to be used. */
    maxTokens?: number
    /** Humour (or custom prompt) to be used. */
    humourPrompt?: string
    /** Style of the generated content. */
    style?: string
    /** The prompt subject. */
    subject?: string
}
