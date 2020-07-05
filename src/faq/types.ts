// Strautomator Core: FAQ types

/**
 * A single FAQ item (question and answer).
 */
export interface FaqQuestion {
    /** The question. */
    question: string
    /** The answer, including HTML tags and formatting. */
    answer: string
    /** Tags for this question. */
    tags: string[]
    /** Scoring  from 1 to 10 (higher has more relevance). */
    score?: number
}
