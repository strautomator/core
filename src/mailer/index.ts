// Strautomator Core: Mailer

import {EmailSendingOptions} from "./types"
import eventManager from "../eventmanager"
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
     * Init the Email manager.
     * @param quickStart If true, will not validate SMTP cconnection, default is false.
     */
    init = async (quickStart?: boolean): Promise<void> => {
        try {
            if (settings.mailer.disabled) {
                logger.warn("Mailer.init", "Disabled on settings, emails will not be sent")
                return
            }

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

            // Validate connection only if quickStart was not set.
            if (!quickStart) {
                try {
                    await this.client.verify()
                } catch (ex) {
                    logger.error("Mailer.init", `Could not verify connection to ${smtp.host} ${smtp.port}, but will proceed anyways`, ex)
                }
            }

            eventManager.on("Admin.alert", this.onAdminAlert)

            logger.info("Mailer.init", smtp.host, smtp.port)
        } catch (ex) {
            logger.error("Mailer.init", ex)
        }
    }

    /**
     * Send an email to the admin when an alert is triggered.
     */
    private onAdminAlert = async (message: string, title?: string) => {
        try {
            const options: EmailSendingOptions = {
                to: settings.mailer.adminEmail,
                subject: title || "Admin alert",
                body: message
            }
            await this.send(options)
        } catch (ex) {
            logger.error("Mailer.onAdminAlert", `Failed to send email with admin alert`)
        }
    }

    // METHODS
    // --------------------------------------------------------------------------

    /**
     * Send an email.
     * @param options Email sending options.
     */
    send = async (options: EmailSendingOptions): Promise<void> => {
        if (settings.mailer.disabled) {
            logger.warn("Mailer.init", "Disabled on settings, will not send", options.to, options.subject)
            return
        }

        try {
            const html = settings.mailer.template.replace("${contents}", options.body)
            const sendingOptions = {
                from: `"${settings.app.title}" <${options.from || settings.mailer.from}>`,
                to: options.to,
                subject: options.subject,
                html: html
            }

            await this.client.sendMail(sendingOptions)
        } catch (ex) {
            logger.error("Mailer.send", options.to, options.subject, ex)
        }
    }
}

// Exports...
export default Mailer.Instance
