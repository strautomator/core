// Strautomator Core: AI types

import {StravaActivity} from "../strava/types"
import {UserData} from "../users/types"

/**
 * AI LLM prompt and response data.
 */
export interface AiGeneratedResponse {
    /** Prompt sent to the LLM. */
    prompt: string
    /** Response from LLM. */
    response: string
    /** Which AI provider was used. */
    provider: "gemini" | "openai"
}

/**
 * AI provider interface.
 */
export interface AiProvider {
    /** Method to generate activity names. */
    generateActivityName(user: UserData, activity: StravaActivity, prompt: string[]): Promise<string>
}
