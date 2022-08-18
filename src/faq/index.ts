// Strautomator Core: FAQ

import {FaqQuestion} from "./types"
import database from "../database"
import _ = require("lodash")
import logger = require("anyhow")
import dayjs from "../dayjs"
const settings = require("setmeup").settings

/**
 * FAQ (frequently asked questions) manager.
 */
export class FAQ {
    private constructor() {}
    private static _instance: FAQ
    static get Instance() {
        return this._instance || (this._instance = new this())
    }

    /**
     * Full list of questions from the database.
     */
    questions: FaqQuestion[] = []

    /** Date when the questions were last downloaded from the database. */
    lastRefresh: number = 0

    // INIT
    // --------------------------------------------------------------------------

    /**
     * Load all questions and answers from the database.
     * @param quickStart If true, will not wait for questions to be loaded.
     */
    init = async (): Promise<void> => {
        try {
            this.refresh()
        } catch (ex) {
            logger.error("FAQ.init", ex)
        }
    }

    /**
     * Refresh questions from the database.
     */
    refresh = async (): Promise<void> => {
        try {
            const result = await database.search("faq", null, ["score", "desc"])

            // Update questions and set last refresh.
            this.lastRefresh = dayjs().unix()
            this.questions = result

            logger.info("FAQ.refresh", `Total of ${result.length} questions`)
        } catch (ex) {
            logger.error("FAQ.refresh", ex)
        }
    }

    // SEARCH
    // --------------------------------------------------------------------------

    /**
     * Search on the FAQ and return the relevant answers.
     * @param query The search query, if empty will return all questions.
     */
    search = async (query?: string): Promise<FaqQuestion[]> => {
        try {
            const regex = new RegExp(query, "i")

            // Refresh questions from the database if they're too old.
            if (this.lastRefresh < dayjs().subtract(settings.faq.refreshInterval, "seconds").unix()) {
                await this.refresh()
            }

            // Return all questions if no query was passed.
            if (!query || query.trim().length == 0) {
                return this.questions
            }

            // Filter only relevant questions.
            const result = _.filter(this.questions, (item) => item.question.search(regex) || item.answer.search(regex)) as FaqQuestion[]
            logger.info("FAQ.search", query, `${result.length} results`)

            return result
        } catch (ex) {
            logger.error("FAQ.search", query, ex)
        }
    }

    // IMPORT
    // --------------------------------------------------------------------------

    /**
     * Import questions into the database. If a question already exists, it will be overwritten.
     * @param questions The list of questions to be imported.
     */
    import = async (questions: FaqQuestion[]): Promise<void> => {
        for (let question of questions) {
            try {
                question.answer = question.answer.replace(/\s\s+/g, " ")

                // Normalize and trim the ID based on the question, if one was not passed.
                if (!question.id) {
                    const filteredWords = ["strautomator", "its", "are", "and", "the", "for", "of", "or", "on", "to", "by", "up", "a", "i"]
                    let id: string = question.question.toLowerCase()

                    for (let word of filteredWords) {
                        id = id.replace(" " + word + " ", " ")
                    }

                    id = id.replace(/'/gi, "").replace(/\W/gi, "-").replace(/--+/g, "-")
                    id = id.substring(0, id.length - 1)
                    question.id = id
                }

                // Default score is 5, minimum is 1 and max is 10.
                if (!question.score) {
                    question.score = 5
                } else if (question.score < 1) {
                    question.score = 1
                } else if (question.score > 10) {
                    question.score = 10
                }

                await database.set("faq", question, question.id)
                logger.info("FAQ.import", question.id, question.question, `${question.answer.length} char`)
            } catch (ex) {
                logger.error("FAQ.import", question.question, ex)
            }
        }
    }
}

// Exports...
export default FAQ.Instance
