// Strautomator Core: Garmin

import {GarminPingPermissions, GarminPing, GarminPingActivityFile, GarminWebhookData} from "./types"
import {Request} from "express"
import activities from "./activities"
import profiles from "./profiles"
import users from "../users"
import jaul from "jaul"
import logger from "anyhow"
import * as logHelper from "../loghelper"
import * as ipRanges from "../ipranges"
const settings = require("setmeup").settings

/**
 * Garmin wrapper.
 */
export class GarminWebhooks {
    private constructor() {}
    private static _instance: GarminWebhooks
    static get Instance() {
        return this._instance || (this._instance = new this())
    }

    /**
     * Process webhooks dispatched by Garmin.
     * @param req The request object.
     */
    processWebhook = async (req: Request): Promise<any> => {
        const userAgent = req.headers["user-agent"]
        const clientIP = (req.headers["cf-connecting-ip"] || jaul.network.getClientIP(req)).toString()
        const logFrom = `From ${clientIP} - ${userAgent}`

        try {
            const body: GarminWebhookData = req.body || null

            // Check user agent and client IP if the checkHeaders flag is set.
            if (settings.garmin.api.checkHeaders) {
                if (!userAgent.includes("Garmin")) {
                    throw new Error(`User agent not authorized: ${userAgent}`)
                }
                if (!jaul.network.ipInRange(clientIP, ipRanges.garmin)) {
                    throw new Error(`Client IP not authorized: ${clientIP}`)
                }
            }

            // No request body? Stop here.
            if (!body) {
                logger.warn("Garmin.processWebhook", logFrom, "No request body, abort")
                return
            }

            logger.info("Garmin.processWebhook", logFrom, Object.keys(body).join(", "))

            // Process webhooks according to the body contents.
            if (body.activityFiles?.length > 0) {
                await this.activityFiles(body.activityFiles)
            }
            if (body.deregistrations?.length > 0) {
                await this.deregistrations(body.deregistrations)
            }
            if (body.userPermissionsChange?.length > 0) {
                await this.userPermissionsChange(body.userPermissionsChange)
            }
        } catch (ex) {
            logger.error("Garmin.processWebhook", logFrom, ex)
        }
    }

    // PING PROCESSING
    // --------------------------------------------------------------------------

    /**
     * Process activity files events.
     * @param items Webhook activityFiles body.
     */
    private activityFiles = async (items: GarminPingActivityFile[]): Promise<void> => {
        for (let data of items || []) {
            try {
                const user = await users.getByGarminId(data.userId)

                // Found a matching user and the activity is of type FIT? Get and parse the activity file.
                if (user?.garmin?.tokens?.accessToken == data.userAccessToken && data.fileType == "FIT") {
                    await activities.processActivity(user, data)
                } else {
                    logger.warn("Garmin.processWebhook.activityFiles", `Profile ${data.userId} has new activities, but no matching user was found`)
                }
            } catch (ex) {
                logger.error("Garmin.processWebhook.activityFiles", data.userId, ex)
            }
        }
    }

    /**
     * Process deregistration events.
     * @param items Webhook deregistrations body.
     */
    private deregistrations = async (items: GarminPing[]): Promise<void> => {
        for (let data of items || []) {
            try {
                const user = await users.getByGarminId(data.userId)

                // Found a matching user? Delete the profile.
                if (user?.garmin?.tokens?.accessToken == data.userAccessToken) {
                    logger.warn("Garmin.processWebhook.deregistrations", logHelper.user(user), `Profile ${data.userId}`)
                    await profiles.deleteProfile(user, true)
                } else {
                    logger.warn("Garmin.processWebhook.deregistrations", `Profile ${data.userId} deregistered, but no matching user was found`)
                }
            } catch (ex) {
                logger.error("Garmin.processWebhook.deregistrations", data.userId, ex)
            }
        }
    }

    /**
     * Process user permission change events. If user removes the ACTIVITY_EXPORT
     * permission, then the service will auto deregister itself.
     * @param items Webhook userPermissionsChange body.
     */
    private userPermissionsChange = async (items: GarminPingPermissions[]): Promise<void> => {
        for (let data of items || []) {
            try {
                if (!data.permissions || !data.permissions.includes("ACTIVITY_EXPORT")) {
                    const user = await users.getByGarminId(data.userId)

                    // Found a matching user? Deregister and delete the profile.
                    if (user?.garmin?.tokens?.accessToken == data.userAccessToken) {
                        logger.warn("Garmin.processWebhook.userPermissionsChange", logHelper.user(user), `Profile ${data.userId} removed the ACTIVITY_EXPORT permission`)
                        await profiles.deleteProfile(user)
                    } else {
                        logger.warn("Garmin.processWebhook.userPermissionsChange", `Profile ${data.userId} changed permissions, but no matching user was found`)
                    }
                }
            } catch (ex) {
                logger.error("Garmin.processWebhook.userPermissionsChange", data.userId, ex)
            }
        }
    }
}

// Exports...
export default GarminWebhooks.Instance
