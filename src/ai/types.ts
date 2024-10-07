// Strautomator Core: AI types

import Bottleneck from "bottleneck"
import {StravaActivity, StravaActivityPerformance, StravaActivityStreams, StravaProcessedActivity} from "../strava/types"
import {UserData} from "../users/types"
import {ActivityWeather} from "../weather/types"

/**
 * AI provider interface.
 */
export interface AiProvider {
    /** Method to generate text. */
    prompt(user: UserData, options: AiGenerateOptions, messages: string[]): Promise<string>
    /** Method to generate an image. */
    imagePrompt?(user: UserData, options: AiGenerateOptions, messages: string[]): Promise<string>
    /** Rate limiter. */
    limiter: Bottleneck
}

/**
 * AI LLM prompt and response data.
 */
export interface AiGeneratedResponse {
    /** Which AI provider was used. */
    provider: "anthropic" | "gemini" | "openai"
    /** Prompt sent to the LLM. */
    prompt: string
    /** Response from LLM. */
    response: string
}

/**
 * AI generation options.
 */
export interface AiGenerateOptions {
    /** AI provider. */
    provider?: "anthropic" | "gemini" | "openai"
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
    /** Max tokens to be used. */
    maxTokens?: number
    /** Humour to be used on the prompt. */
    humour?: string
    /** The prompt subject. */
    subject?: string
}
