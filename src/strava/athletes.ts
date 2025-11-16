// Strautomator Core: Strava Athletes

import {StravaActivity, StravaRecords, StravaGear, StravaProfile, StravaProfileStats, StravaRecordDetails, StravaTotals, StravaTokens, StravaTrackedRecords, StravaAthleteRecords} from "./types"
import {toStravaGear, toStravaProfile, toStravaProfileStats} from "./utils"
import {UserData} from "../users/types"
import users from "../users"
import api from "./api"
import database from "../database"
import _ from "lodash"
import logger from "anyhow"
import * as logHelper from "../loghelper"
const settings = require("setmeup").settings

/**
 * Strava athletes manager.
 */
export class StravaAthletes {
    private constructor() {}
    private static _instance: StravaAthletes
    static get Instance(): StravaAthletes {
        return this._instance || (this._instance = new this())
    }

    // GET ATHLETE DATA
    // --------------------------------------------------------------------------

    /**
     * Get profile info for the logged user.
     * @param tokens Strava access tokens.
     * @param deauthCheck Is it a check to validate if user is still authorized?
     */
    getAthlete = async (tokens: StravaTokens, deauthCheck?: boolean): Promise<StravaProfile> => {
        try {
            const data = await api.get(tokens, "athlete")
            const profile = toStravaProfile(data)

            // Username should be always lowercased.
            if (profile.username) {
                profile.username = profile.username.toLowerCase()
            }

            logger.info("Strava.getAthlete", `ID ${profile.id}`, profile.username || profile.firstName || profile.lastName)
            return profile
        } catch (ex) {
            if (deauthCheck && ex.response?.status == 401) {
                return null
            }

            const tokenLog = []
            if (tokens.accessToken) tokenLog.push(`Access *${tokens.accessToken.substring(10, 13)}*`)
            if (tokens.refreshToken) tokenLog.push(`Refresh *${tokens.refreshToken.substring(10, 13)}*`)

            logger.error("Strava.getAthlete", tokenLog.length > 0 ? tokenLog.join(", ") : "No tokens", ex)
            throw ex
        }
    }

    /**
     * Get profile stats for the logged user.
     * @param user The user to get stats for.
     */
    getProfileStats = async (user: UserData): Promise<StravaProfileStats> => {
        try {
            const units = user.profile.units == "imperial" ? "mi" : "km"
            const data = await api.get(user.stravaTokens, `athletes/${user.id}/stats`)
            const stats = toStravaProfileStats(user, data)

            const arrStats = []
            if (stats.allRideTotals) arrStats.push([stats.allRideTotals, "Ride"])
            if (stats.allRunTotals) arrStats.push([stats.allRunTotals, "Run"])
            if (stats.allSwimTotals) arrStats.push([stats.allSwimTotals, "Swim"])

            const statsLog = arrStats.map((s: [StravaTotals, string]) => `${s[1]}: ${s[0].count} - ${s[0].distance} ${units}`)
            logger.info("Strava.getProfileStats", logHelper.user(user), statsLog.join(" | "))

            return stats
        } catch (ex) {
            logger.error("Strava.getProfileStats", logHelper.user(user), ex)
            throw ex
        }
    }

    /**
     * Get gear details from Strava.
     * @param user User data.
     * @param id The gear ID string.
     */
    getGear = async (user: UserData, id: string): Promise<StravaGear> => {
        logger.debug("Strava.getGear", user.id, id)

        try {
            const data = await api.get(user.stravaTokens, `gear/${id}`)
            const gear = toStravaGear(user.profile, data)

            logger.info("Strava.getGear", logHelper.user(user), `Gear ${id}: ${gear.name} - distance ${gear.distance}`)
            return gear
        } catch (ex) {
            logger.error("Strava.getGear", logHelper.user(user), id, ex)
            throw ex
        }
    }

    // RECORDS
    // --------------------------------------------------------------------------

    /**
     * Check if the passed activities have broken any new records, and return the
     * records object if any new values were set.
     * @param user The user account.
     * @param activities List of activities to be checked against.
     */
    checkActivityRecords = async (user: UserData, activities: StravaActivity[]): Promise<StravaAthleteRecords> => {
        const debugLogger = user.debug ? logger.warn : logger.debug

        try {
            if (user.suspended) {
                logger.warn("Strava.checkActivityRecords", logHelper.user(user), `User suspended, won't check`)
                return null
            }
            if (user.preferences?.privacyMode) {
                logger.info("Strava.checkActivityRecords", logHelper.user(user), "User has opted in for privacy mode, won't check")
                return null
            }
            if (!activities || activities.length == 0) {
                debugLogger("Strava.checkActivityRecords", logHelper.user(user), "No activities to be checked")
                return null
            }

            // Only proceed if athlete has the records document initialized.
            const allRecords = await this.getAthleteRecords(user)
            if (!allRecords) {
                debugLogger("Strava.checkActivityRecords", logHelper.user(user), "No previous records found, will not proceed")
                return null
            }

            const result: StravaAthleteRecords = {}
            const minMovingTime = settings.strava.records.minMovingTimeAvg
            let hasNewRecord = false

            // Iterate the passed activities to check for new records.
            for (let activity of activities) {
                try {
                    if (!user.isPro && !settings.plans.free.recordSports.includes(activity.sportType)) {
                        debugLogger("Strava.checkActivityRecords", logHelper.user(user), `${logHelper.activity(activity)} ${activity.sportType} not tracked on free accounts`)
                        continue
                    }

                    if (!allRecords[activity.sportType]) {
                        allRecords[activity.sportType] = {}
                    }

                    const currentRecords: StravaRecords = allRecords[activity.sportType]

                    // If activity had no power meter, exclude the power based records.
                    // Check all of the possible record properties.
                    const props = activity.hasPower ? StravaTrackedRecords : StravaTrackedRecords.filter((r) => !r.includes("watts"))
                    for (let prop of props) {
                        const currentValue: number = currentRecords[prop] ? currentRecords[prop].value || 0 : 0

                        // Has broken a new record? If an average-based metric, was the
                        // activity longer than the minMovingTimeAvg setting?
                        if (activity[prop] && activity[prop] > currentValue) {
                            if (prop.includes("Avg") && activity.movingTime < minMovingTime) {
                                debugLogger("Strava.checkActivityRecords", logHelper.user(user), prop, `${logHelper.activity(activity)} has less than ${minMovingTime}`)
                                continue
                            }

                            // Make sure the new records references exist.
                            if (!result[activity.sportType]) result[activity.sportType] = {}
                            if (!activity.newRecords) activity.newRecords = []

                            const details: StravaRecordDetails = {
                                value: activity[prop],
                                previous: currentValue,
                                activityId: activity.id,
                                date: activity.dateEnd
                            }

                            allRecords[activity.sportType][prop] = details
                            result[activity.sportType][prop] = details
                            activity.newRecords.push(prop)

                            hasNewRecord = true
                        }
                    }
                } catch (ex) {
                    logger.error("Strava.checkActivityRecords", logHelper.user(user), logHelper.activity(activity), ex)
                }
            }

            // User has broken a personal record? Save it.
            if (hasNewRecord) {
                await this.setAthleteRecords(user, result)
                return result
            }

            debugLogger("Strava.checkActivityRecords", logHelper.user(user), `${activities.length} activities`, "No new records")
            return null
        } catch (ex) {
            logger.error("Strava.checkActivityRecords", logHelper.user(user), `${activities.length} activities`, ex)
            return null
        }
    }

    /**
     * Get the PRs (records) for the specified user.
     * @param user The user account.
     */
    getAthleteRecords = async (user: UserData): Promise<StravaAthleteRecords> => {
        try {
            const records: StravaAthleteRecords = await database.get("athlete-records", user.id)

            if (records) {
                const entries = Object.entries(records).filter((k) => !["id", "dateCreated", "dateRefreshed"].includes(k[0]))
                const count = _.sum(entries.map((entry) => Object.keys(entry[1]).length))

                if (count > 0) {
                    logger.info("Strava.getAthleteRecords", logHelper.user(user), `${count} records`)
                }
            } else {
                logger.debug("Strava.getAthleteRecords", logHelper.user(user), "User has no records saved")
            }

            return records || null
        } catch (ex) {
            logger.error("Strava.getAthleteRecords", logHelper.user(user), ex)
        }
    }

    /**
     * Save the personal records for the specified user.
     * @param user The user account.
     * @param records The new records.
     */
    setAthleteRecords = async (user: UserData, records: StravaAthleteRecords): Promise<void> => {
        try {
            if (!records) {
                logger.info("Strava.setAthleteRecords", logHelper.user(user), "No new records to be saved")
                return
            }

            const sports = Object.keys(records)

            // Log new records by sport.
            for (let sport of sports) {
                const recordsLog = _.map(_.toPairs(records[sport]), (r) => `${r[0]}=${r[1]["value"]}`).join(" | ")
                logger.info("Strava.setAthleteRecords", logHelper.user(user), sport, recordsLog)
            }

            // Set document ID and save to the database.
            records.id = user.id as any
            await database.merge("athlete-records", records)
        } catch (ex) {
            logger.error("Strava.setAthleteRecords", logHelper.user(user), ex)
        }
    }

    /**
     * Prepare the athlete records using the profile stats / totals as a baseline.
     * @param user The user account.
     */
    prepareAthleteRecords = async (user: UserData): Promise<void> => {
        try {
            if (user.preferences.privacyMode) {
                logger.info("Strava.prepareAthleteRecords", logHelper.user(user), "User has opted in for privacy mode, won't proceed")
                return
            }

            const records: StravaAthleteRecords = {id: user.id, dateRefreshed: new Date()}
            let sportCount = 0

            // First we get the basic totals from the user's profile.
            const profileStats = await this.getProfileStats(user)
            const recentStats: {[sport: string]: StravaTotals} = {
                Ride: profileStats.recentRideTotals,
                Run: profileStats.recentRunTotals
            }

            // Swim only for PRO users.
            if (user.isPro) {
                recentStats.Swim = profileStats.recentSwimTotals
            }

            // Crude estimation of maximum distances based on recent activity stats for ride, run and swim.
            for (let [sport, stats] of Object.entries(recentStats)) {
                if (stats && stats.count > 0) {
                    sportCount++
                    records[sport] = {
                        distance: {value: Math.round(stats.distance / stats.count), previous: 0}
                    }
                }
            }

            // Extra ride stats.
            if (profileStats.allRideTotals && profileStats.allRideTotals.distance > 0) {
                records.Ride = {
                    distance: {value: profileStats.biggestRideDistance, previous: 0}
                }
            }

            logger.info("Strava.prepareAthleteRecords", logHelper.user(user), `${sportCount || "no"} baseline sports created`)

            // Save base document to the database.
            await database.set("athlete-records", records, user.id)
        } catch (ex) {
            logger.error("Strava.prepareAthleteRecords", logHelper.user(user), ex)
        }
    }

    /**
     * Delete all the saved personal records for the specified user.
     * Returns true if a document was deleted, false otherwise.
     * @param user The user account.
     */
    deleteAthleteRecords = async (user: UserData): Promise<boolean> => {
        try {
            const count = await database.delete("athlete-records", user.id)
            logger.info("Strava.deleteAthleteRecords", logHelper.user(user), `${count ? "Deleted" : "No records to delete"}`)

            return count > 0
        } catch (ex) {
            logger.error("Strava.deleteAthleteRecords", logHelper.user(user), ex)
            return false
        }
    }

    // AUTH
    // --------------------------------------------------------------------------

    /**
     * Check if the specified athlete still has the Strautomator app authorized.
     * @param userId The user ID.
     */
    deauthCheck = async (userId: string): Promise<void> => {
        try {
            const user = await users.getById(userId)

            if (user) {
                const athlete = await this.getAthlete(user.stravaTokens, true)

                // If athlete was returned as null, means it was deauthorized.
                if (!athlete) {
                    await users.suspend(user, "Could not fetch Strava profile data (access denied)")
                }
            }
        } catch (ex) {
            logger.error("Strava.deauthCheck", userId, ex)
        }
    }
}

// Exports...
export default StravaAthletes.Instance
