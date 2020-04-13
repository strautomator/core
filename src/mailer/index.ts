// Strautomator Core: Mailer

import {EmailSendingOptions} from "./types"
import logger = require("anyhow")
import nodemailer = require("nodemailer")
const settings = require("setmeup").settings

/**
 * Email manager.
 */
export class Mailer {
    private constructor() {}
    private static _instance: Mailer
    static get Instance() {
        return this._instance || (this._instance = new this())
    }

    private client = null

    // INIT
    // --------------------------------------------------------------------------

    /**
     * Init the email manager.
     */
    init = async (): Promise<void> => {
        try {
            if (!settings.mailer.from) {
                throw new Error("Missing the mailer.from setting")
            }
            if (!settings.mailer.smtp) {
                throw new Error("Missing the mailer.smtp server settings")
            }
            if (!settings.mailer.smtp.auth.user || !settings.mailer.smtp.auth.pass) {
                throw new Error("Missing user and pass on mailer.smtp.auth settings")
            }

            // Create and test the SMTP client.
            const smtp = settings.mailer.smtp
            this.client = nodemailer.createTransport(smtp)
            await this.client.verify()

            logger.info("Mailer.init", smtp.host, smtp.port)
        } catch (ex) {
            logger.error("Mailer.init", ex)
            process.exit(37)
        }
    }

    // METHODS
    // --------------------------------------------------------------------------

    /**
     * Send an email.
     * @param options Email sending options.
     */
    send = async (options: EmailSendingOptions): Promise<void> => {
        try {
            await this.client.send(options)
        } catch (ex) {
            logger.error("Mailer.send", options.to, options.subject, ex)
        }
    }
}

// Exports...
export default Mailer.Instance
