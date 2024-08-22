// Strautomator Core: Garmin Activities

import {FieldValue} from "@google-cloud/firestore"
import {GarminPingActivityFile} from "./types"
import {FitFileActivity} from "../fitparser/types"
import {UserData} from "../users/types"
import api from "./api"
import eventManager from "../eventmanager"
import fitparser from "../fitparser"
import users from "../users"
import _ from "lodash"
import logger from "anyhow"
import dayjs from "../dayjs"
import * as logHelper from "../loghelper"

/**
 * Garmin activities.
 */
export class GarminActivities {
    private constructor() {}
    private static _instance: GarminActivities
    static get Instance() {
        return this._instance || (this._instance = new this())
    }

    /**
     * Get, process and save parsed FIT activity data from Garmin.
     * @param user User requesting the Garmin data.
     * @param ping The Garmin activity ping data.
     */
    processActivity = async (user: UserData, ping: GarminPingActivityFile): Promise<any> => {
        if (!ping || !ping.activityId || !ping.userId) {
            logger.error("Garmin.processActivity", logHelper.user(user), logHelper.garminPing(ping), "Missing activityId or userId, won't process")
            return
        }

        // Base activity data to be saved to the database.
        const garminActivity: FitFileActivity = {
            userId: user.id,
            profileId: ping.userId,
            id: ping.activityId,
            name: ping.activityName,
            dateStart: dayjs.unix(ping.startTimeInSeconds).utc().toDate()
        }

        // Activity has a callback URL? Download and process the FIT file to extract the device IDs.
        try {
            if (ping.callbackURL) {
                const rawData = await this.getActivityFile(user, ping)
                if (rawData) {
                    try {
                        await fitparser.parse(user, garminActivity, rawData)

                        // Reset the Garmin failures counter, if there's one.
                        if (user.garminFailures && user.garminFailures > 0) {
                            delete user.garminFailures
                            await users.update({id: user.id, displayName: user.displayName, garminFailures: FieldValue.delete() as any})
                        }
                    } catch (innerEx) {
                        logger.error("Garmin.processActivity", logHelper.user(user), logHelper.fitFileActivity(garminActivity), "Failed to parse fit file", innerEx)
                    }
                }
            }
        } catch (ex) {
            logger.error("Garmin.processActivity", logHelper.user(user), logHelper.garminPing(ping), ex)
            eventManager.emit("Garmin.activityFailure", user)
        } finally {
            await fitparser.saveProcessedActivity(user, "garmin", garminActivity)
        }
    }

    // DATA FROM GARMIN
    // --------------------------------------------------------------------------

    /**
     * Get list of activities for the user.
     * @param user User requesting the Garmin data.
     * @param dateFrom From date.
     * @param dateTo Optional date to, defaults to dateFrom + 24 hours.
     */
    getActivities = async (user: UserData, dateFrom: dayjs.Dayjs, dateTo?: dayjs.Dayjs): Promise<void> => {
        try {
            if (!dateTo) {
                dateTo = dateFrom.add(86399, "seconds")
            }

            const tokens = user.garmin.tokens
            const query = `uploadStartTimeInSeconds=${dateFrom.utc().unix()}&uploadEndTimeInSeconds=${dateTo.utc().unix()}`
            const res = await api.makeRequest(tokens, `wellness-api/rest/activities?${query}`)

            return res
        } catch (ex) {
            logger.error("Garmin.getActivities", logHelper.user(user), ex)
            throw ex
        }
    }

    /**
     * Get the activity FIT file for the specified activity. Returns the raw activity data.
     * @param user User requesting the Garmin data.
     * @param ping The Garmin activity ping data.
     */
    getActivityFile = async (user: UserData, ping: GarminPingActivityFile): Promise<any> => {
        try {
            if (!ping || !ping.callbackURL) {
                throw new Error("Missing activity callbackURL")
            }

            // Try fetching the FIT file specified in the callback URL.
            const tokens = user.garmin.tokens
            const res = await api.makeRequest(tokens, ping.callbackURL, "GET", true)
            if (res) {
                return Buffer.from(res)
            }

            // Failed to download FIT file.
            logger.warn("Garmin.getActivityFile", logHelper.user(user), logHelper.garminPing(ping), "Failed to download raw data")
            return null
        } catch (ex) {
            logger.error("Garmin.getActivityFile", logHelper.user(user), logHelper.garminPing(ping), ex)

            if (ex?.response?.status == 410) {
                throw new Error("Activity file does not exist anymore")
            } else {
                throw ex
            }
        }
    }
}

// Exports...
export default GarminActivities.Instance
