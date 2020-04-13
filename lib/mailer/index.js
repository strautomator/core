"use strict";
// Strautomator Core: Mailer
Object.defineProperty(exports, "__esModule", { value: true });
const logger = require("anyhow");
const nodemailer = require("nodemailer");
const settings = require("setmeup").settings;
/**
 * Email manager.
 */
class Mailer {
    constructor() {
        this.client = null;
        // INIT
        // --------------------------------------------------------------------------
        /**
         * Init the email manager.
         */
        this.init = async () => {
            try {
                if (!settings.mailer.from) {
                    throw new Error("Missing the mailer.from setting");
                }
                if (!settings.mailer.smtp) {
                    throw new Error("Missing the mailer.smtp server settings");
                }
                if (!settings.mailer.smtp.auth.user || !settings.mailer.smtp.auth.pass) {
                    throw new Error("Missing user and pass on mailer.smtp.auth settings");
                }
                // Create and test the SMTP client.
                const smtp = settings.mailer.smtp;
                this.client = nodemailer.createTransport(smtp);
                try {
                    await this.client.verify();
                }
                catch (ex) {
                    logger.error("Mailer.init", `Could not verify connection to ${smtp.host} ${smtp.port}, but will proceed anyways`);
                }
                logger.info("Mailer.init", smtp.host, smtp.port);
            }
            catch (ex) {
                logger.error("Mailer.init", ex);
                process.exit(37);
            }
        };
        // METHODS
        // --------------------------------------------------------------------------
        /**
         * Send an email.
         * @param options Email sending options.
         */
        this.send = async (options) => {
            try {
                await this.client.send(options);
            }
            catch (ex) {
                logger.error("Mailer.send", options.to, options.subject, ex);
            }
        };
    }
    static get Instance() {
        return this._instance || (this._instance = new this());
    }
}
exports.Mailer = Mailer;
// Exports...
exports.default = Mailer.Instance;
