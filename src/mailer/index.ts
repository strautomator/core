// Strautomator Core: Mailer

import {EmailSendingOptions, EmailBaseTemplate, EmailTemplates} from "./types"
import eventManager from "../eventmanager"
import jaul = require("jaul")
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
     * Init the Email Manager.
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
     * Sends an email.
     * @param options Email sending options.
     */
    send = async (options: EmailSendingOptions): Promise<void> => {
        if (settings.mailer.disabled) {
            logger.warn("Mailer.init", "Disabled on settings, will not send", options.to, options.subject)
            return
        }

        let body: string = options.body
        let subject: string = options.subject

        try {
            if (options.template) {
                const template = EmailTemplates[options.template]

                // If a template was passed, make sure it's valid.
                if (!template) {
                    throw new Error(`Invalid template: ${options.template}`)
                }

                // Template has a body defined?
                if (template.body) {
                    body = template.body
                }

                // Template has a subject defined?
                if (template.subject) {
                    subject = template.subject
                }
            }

            // Make sure all necessary fields are filled in.
            if (!options.to) {
                throw new Error(`Missing 'to' address`)
            }
            if (!body) {
                throw new Error(`Missing email body`)
            }
            if (!subject) {
                throw new Error(`Missing email subject`)
            }

            // Replace keywords on the email template and subject.
            if (options.data) {
                body = jaul.data.replaceTags(body, options.data)
                subject = jaul.data.replaceTags(subject, options.data)
            }

            // Replace default keywords (from app).
            const defaultTags = {
                appUrl: settings.app.url,
                appTitle: settings.app.title
            }
            body = jaul.data.replaceTags(body, defaultTags)
            subject = jaul.data.replaceTags(subject, defaultTags)

            // Append body to the base HTML template.
            body = EmailBaseTemplate.replace("${contents}", body)

            const sendingOptions = {
                from: `"${settings.app.title}" <${options.from || settings.mailer.from}>`,
                to: options.to,
                subject: subject,
                html: body
            }

            await this.client.sendMail(sendingOptions)
        } catch (ex) {
            logger.error("Mailer.send", options.to, subject, ex)
        }
    }
}

// Exports...
export default Mailer.Instance
