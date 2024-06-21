// Strautomator Core: AI types

import Bottleneck from "bottleneck"
import {StravaActivity, StravaActivityPerformance, StravaActivityStreams} from "../strava/types"
import {UserData} from "../users/types"
import {ActivityWeather} from "../weather/types"

/**
 * AI provider interface.
 */
export interface AiProvider {
    /** Method to generate activity names. */
    activityPrompt(user: UserData, activity: StravaActivity, prompt: string[], maxTokens: number): Promise<string>
    /** Flag to tell if the provider is currently being rate limited. */
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

export interface AiGenerateOptions {
    /** AI provider. */
    provider?: "anthropic" | "gemini" | "openai"
    /** Referenced activity. */
    activity: StravaActivity
    /** Optional activity streams for a more detailed prompt. */
    activityStreams?: StravaActivityStreams
    /** Optional activity performance (power intervals). */
    activityPerformance?: StravaActivityPerformance
    /** Use full activity details regardless of their values. */
    fullDetails?: boolean
    /** Max tokens to be used. */
    maxTokens?: number
    /** Humour to be used on the prompt. */
    humour?: string
    /** Optional weather for the start and end of the activity. */
    weatherSummaries?: ActivityWeather
    /** Text to be added before the activity prompt. */
    prepend?: string[]
    /** Text to be added after the activity prompt. */
    append?: string[]
}
