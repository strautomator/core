// Strautomator Core: Wahoo Activities

import {WahooActivity, WahooWebhookData} from "./types"
import {toWahooActivity} from "./utils"
import {FitFileActivity} from "../fitparser/types"
import {UserData} from "../users/types"
import fitparser from "../fitparser"
import api from "./api"
import _ from "lodash"
import logger from "anyhow"
import * as logHelper from "../loghelper"
import dayjs from "../dayjs"

/**
 * Wahoo API activities.
 */
export class WahooActivities {
    private constructor() {}
    private static _instance: WahooActivities
    static get Instance() {
        return this._instance || (this._instance = new this())
    }

    /**
     *  Get, process and save parsed FIT activity data from Wahoo.
     * @param user User requesting the Wahoo data.
     * @param webhookData The Wahoo webhook data.
     */
    processActivity = async (user: UserData, webhookData: WahooWebhookData): Promise<any> => {
        if (!webhookData || !webhookData.workout_summary || !webhookData.workout_summary.workout) {
            logger.error("Wahoo.processActivity", logHelper.user(user), logHelper.wahooWebhook(webhookData), "Missing workout summary, won't process")
            return
        }
        if (!webhookData.workout_summary.file) {
            logger.error("Wahoo.processActivity", logHelper.user(user), logHelper.wahooWebhook(webhookData), "Missing workout file URL, won't process")
            return
        }

        const summary = webhookData.workout_summary

        // Base activity data to be saved to the database.
        const wahooActivity: FitFileActivity = {
            userId: user.id,
            profileId: webhookData.user.id,
            id: summary.id,
            name: summary.workout.name,
            dateStart: dayjs(summary.workout.starts).utc().toDate()
        }

        // Activity has a file URL? Download and process the FIT file to extract the device IDs.
        try {
            const rawData = await this.getActivityFile(user, webhookData)
            if (rawData) {
                try {
                    await fitparser.parse(user, wahooActivity, rawData)
                } catch (innerEx) {
                    logger.error("Wahoo.processActivity", logHelper.user(user), logHelper.fitFileActivity(wahooActivity), "Failed to parse fit file", innerEx)
                }
            }
        } catch (ex) {
            logger.error("Wahoo.processActivity", logHelper.user(user), logHelper.wahooWebhook(webhookData), ex)
        } finally {
            await fitparser.saveProcessedActivity(user, "wahoo", wahooActivity)
        }
    }

    // DATA FROM WAHOO
    // --------------------------------------------------------------------------

    /**
     * Get list of activities (workouts) for the user.
     * @param user User requesting the Wahoo data.
     * @param dateFrom From date.
     * @param dateTo Optional date to, defaults to dateFrom + 24 hours.
     */
    getActivities = async (user: UserData): Promise<WahooActivity[]> => {
        try {
            const data = await api.makeRequest(user.wahoo.tokens, "v1/workouts")

            if (data?.workouts) {
                logger.info("Wahoo.getActivities", logHelper.user(user), `Got ${data.workouts.length} recent activities`)
                return data.workouts.map((w) => toWahooActivity(w))
            }

            logger.info("Wahoo.getActivities", logHelper.user(user), "No recent activities")
            return []
        } catch (ex) {
            logger.error("Wahoo.getActivities", logHelper.user(user), ex)
            throw ex
        }
    }

    /**
     * Get the activity FIT file for the specified activity. Returns the raw activity data.
     * @param user User requesting the Wahoo data.
     * @param webhookData The Wahoo activity webhook data.
     */
    getActivityFile = async (user: UserData, webhookData: WahooWebhookData): Promise<any> => {
        try {
            if (!webhookData || !webhookData.workout_summary || !webhookData.workout_summary.file) {
                throw new Error("Missing activity file URL")
            }

            // Try fetching the FIT file specified in the webhook data.
            const res = await api.makeRequest(null, webhookData.workout_summary.file.url, true)
            if (res) {
                return Buffer.from(res)
            }

            // Failed to download FIT file.
            logger.warn("Wahoo.getActivityFile", logHelper.user(user), logHelper.wahooWebhook(webhookData), "Failed to download raw data")
            return null
        } catch (ex) {
            logger.error("Wahoo.getActivityFile", logHelper.user(user), logHelper.wahooWebhook(webhookData), ex)
            throw ex
        }
    }
}

// Exports...
export default WahooActivities.Instance
