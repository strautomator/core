// Strautomator Core: Wahoo Webhooks

import {WahooWebhookData} from "./types"
import {Request} from "express"
import wahooActivities from "./activities"
import users from "../users"
import jaul from "jaul"
import logger from "anyhow"
import * as logHelper from "../loghelper"
const settings = require("setmeup").settings

/**
 * Wahoo webhooks wrapper.
 */
export class WahooWebhooks {
    private constructor() {}
    private static _instance: WahooWebhooks
    static get Instance() {
        return this._instance || (this._instance = new this())
    }

    /**
     * Process webhooks dispatched by Wahoo.
     * @param req The request object.
     */
    processWebhook = async (req: Request): Promise<any> => {
        const data: WahooWebhookData = req.body
        const userAgent = req.headers["user-agent"]
        const clientIP = (req.headers["cf-connecting-ip"] || jaul.network.getClientIP(req)).toString()
        const logFrom = `From ${clientIP} - ${userAgent}`

        try {
            if (!data) {
                throw new Error("Missing webhook data")
            }

            // Check if the token is valid.
            const token = data.webhook_token
            if (!token || token != settings.wahoo.api.webhookToken) {
                throw new Error("Invalid webhook token")
            }

            // At the moment we only process FIT files from workout summaries, but log other events.
            if (data.event_type != "workout_summary" || !data.workout_summary) {
                logger.warn("Wahoo.processWebhook", logFrom, logHelper.wahooWebhook(data), "Ignored event type")
                return
            }

            // Validate user.
            const user = await users.getByWahooId(data.user.id)
            if (!user) {
                logger.warn("Wahoo.processWebhook", logFrom, logHelper.wahooWebhook(data), "No matching account found")
                return
            }

            // Go!
            await wahooActivities.processActivity(user, data)
        } catch (ex) {
            logger.error("Wahoo.processWebhook", logFrom, logHelper.wahooWebhook(data), ex)
        }
    }
}

// Exports...
export default WahooWebhooks.Instance
