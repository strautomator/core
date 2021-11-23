// Strautomator Core: Strava Athletes

import {StravaActivity, StravaRecords, StravaEstimatedFtp, StravaGear, StravaProfile, StravaProfileStats, StravaRecordDetails, StravaSport, StravaTotals, StravaTokens, StravaTrackedRecords, StravaAthleteRecords} from "./types"
import {toStravaGear, toStravaProfile, toStravaProfileStats} from "./utils"
import {UserData} from "../users/types"
import users from "../users"
import api from "./api"
import database from "../database"
import _ = require("lodash")
import logger = require("anyhow")
import dayjs from "../dayjs"
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
        logger.debug("Strava.getAthlete")

        try {
            const data = await api.get(tokens, "athlete")
            const profile = toStravaProfile(data)

            logger.info("Strava.getAthlete", `ID ${profile.id}`, profile.username || profile.firstName || profile.lastName)
            return profile
        } catch (ex) {
            if (deauthCheck && ex.response && ex.response.status == 401) {
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
        logger.debug("Strava.getProfileStats", user.id)

        try {
            const units = user.profile.units == "imperial" ? "mi" : "km"
            const data = await api.get(user.stravaTokens, `athletes/${user.id}/stats`)
            const stats = toStravaProfileStats(user, data)

            const arrStats = []
            if (stats.allRideTotals) arrStats.push([stats.allRideTotals, "Ride"])
            if (stats.allRunTotals) arrStats.push([stats.allRunTotals, "Run"])
            if (stats.allSwimTotals) arrStats.push([stats.allSwimTotals, "Swim"])

            const statsLog = arrStats.map((s: [StravaTotals, string]) => `${s[1]}: ${s[0].count} - ${s[0].distance} ${units}`)
            logger.info("Strava.getProfileStats", `User ${user.id} ${user.displayName}`, statsLog.join(" | "))

            return stats
        } catch (ex) {
            logger.error("Strava.getProfileStats", `User ${user.id} ${user.displayName}`, ex)
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

            logger.info("Strava.getGear", `User ${user.id} ${user.displayName}`, `Gear ${id}: ${gear.name} - distance ${gear.distance}`)
            return gear
        } catch (ex) {
            logger.error("Strava.getGear", `User ${user.id} ${user.displayName}`, id, ex)
            throw ex
        }
    }

    // FTP
    // --------------------------------------------------------------------------

    /**
     * Update the user's FTP.
     * @param user User data.
     * @param ftp The FTP (as number).
     * @param force Force update, even if FTP was updated recently or is still the same value.
     */
    setAthleteFtp = async (user: UserData, ftp: number, force?: boolean): Promise<boolean> => {
        logger.debug("Strava.setAthleteFtp", user.id, ftp)

        try {
            if (ftp <= 0) {
                throw new Error("Invalid FTP, must be higher than 0")
            }

            // Updating the FTP via Strautomator is limited to once every 24 hours by default,
            // and only if the value actually changed. Ignore these conditions if force is set.
            if (!force) {
                if (user.dateLastFtpUpdate) {
                    const now = dayjs().subtract(settings.strava.ftp.sinceLastHours, "hours").unix()
                    const lastUpdate = dayjs(user.dateLastFtpUpdate).unix()

                    if (lastUpdate >= now) {
                        logger.warn("Strava.setAthleteFtp", `User ${user.id} ${user.displayName}`, `FTP ${ftp}`, `Abort, FTP was already updated recently`)
                        return false
                    }
                }

                // Only update the FTP if it was changed by at least 1%.
                const percentChanged = 100 * Math.abs((ftp - user.profile.ftp) / ((ftp + user.profile.ftp) / 2))
                if (percentChanged < 1) {
                    logger.warn("Strava.setAthleteFtp", `User ${user.id} ${user.displayName}`, `Only ${percentChanged}% changed, won't update`)
                    return false
                }
            }

            // All good? Update FTP on Strava and save date to the database.
            await api.put(user.stravaTokens, `athlete`, {ftp: ftp})
            await users.update({id: user.id, displayName: user.displayName, dateLastFtpUpdate: new Date()})
            logger.info("Strava.setAthleteFtp", `User ${user.id} ${user.displayName}`, `FTP ${ftp}`)

            return true
        } catch (ex) {
            logger.error("Strava.setAthleteFtp", ex)
        }
    }

    /**
     * Estimate the user's FTP based on the passed activities.
     * @param user The user to estimate the FTP for.
     * @param activities List of activities to be used for the estimation.
     */
    estimateFtp = async (user: UserData, activities: StravaActivity[]): Promise<StravaEstimatedFtp> => {
        try {
            if (!activities || activities.length == 0) {
                logger.warn("Strava.estimateFtp", `User ${user.id} ${user.displayName}`, "No activities, can't estimate FTP")
                return null
            }

            let listWatts: number[] = []
            let avgWatts: number = 0
            let maxWatts: number = 0
            let ftpWatts: number = 0
            let currentWatts: number = 0
            let bestActivity: StravaActivity
            let lastActivityDate = new Date("2000-01-01")
            let adjusted: boolean = false

            // Iterate activities to get the highest FTP possible.
            for (let a of activities) {
                const totalTime = a.movingTime || a.totalTime

                // Date of the last activity.
                if (dayjs(a.dateEnd).isAfter(lastActivityDate)) {
                    lastActivityDate = a.dateEnd
                }

                // Ignore cycling activities with no power meter or that lasted less than 20 minutes.
                if (a.type != StravaSport.Ride && a.type != StravaSport.VirtualRide) continue
                if (totalTime < 60 * 20) continue
                if (!a.hasPower) continue

                let watts = a.wattsWeighted > a.wattsAvg ? a.wattsWeighted : a.wattsAvg
                let power: number

                // FTP ranges from 95% to 100% from 20 minutes to 1 hour, and then
                // 103.5% for each extra hour of activity time.
                if (totalTime <= 3600) {
                    const perc = ((3600 - totalTime) / 60 / 8) * 0.01
                    power = Math.round(watts * (1 - perc))
                } else {
                    const extraHours = Math.floor(totalTime / 3600) - 1
                    const fraction = 1 + 0.035 * ((totalTime % 3600) / 60 / 60)
                    const factor = 1.035 ** extraHours * fraction
                    power = watts * factor
                }

                // New best power?
                if (power > maxWatts) {
                    maxWatts = power
                    bestActivity = a
                }

                listWatts.push(power)
            }

            // No activities with power? Stop here.
            if (listWatts.length == 0) {
                return null
            }

            // Make sure we have the very latest athlete data.
            try {
                const athlete = await this.getAthlete(user.stravaTokens)
                user.profile.ftp = athlete.ftp
            } catch (athleteEx) {
                logger.warn("Strava.estimateFtp", `User ${user.id} ${user.displayName}`, "Could not get latest athlete data, will use the current one")
            }

            avgWatts = Math.round(_.mean(listWatts))
            maxWatts = Math.round(maxWatts)
            currentWatts = user.profile.ftp || 0

            // Calculate weighted average (towards the current FTP).
            // If highest activity FTP is higher than current FTP, set it as the new value.
            // Otherwise get the weighted or current value itself, whatever is the lowest.
            if (currentWatts && currentWatts > maxWatts) {
                const maxWattsWeight = [maxWatts, 1]
                const currentWattsWeight = [currentWatts, 1.15]
                const ftpWeights = [maxWattsWeight, currentWattsWeight]
                const [ftpTotalSum, ftpWeightSum] = ftpWeights.reduce(([valueSum, weightSum], [value, weight]) => [valueSum + value * weight, weightSum + weight], [0, 0])
                ftpWatts = ftpTotalSum / ftpWeightSum
            } else {
                ftpWatts = maxWatts
            }

            // Check if the FTP was recently updated for that user.
            let recentlyUpdated: boolean = false
            if (user.dateLastFtpUpdate) {
                const now = dayjs().subtract(settings.strava.ftp.sinceLastHours, "hours").unix()
                const lastUpdate = dayjs(user.dateLastFtpUpdate).unix()
                recentlyUpdated = lastUpdate >= now
            }

            // Adjusted loss per week off the bike.
            const weeks = Math.floor(dayjs().diff(lastActivityDate, "d") / 7)
            if (weeks > 0) {
                adjusted = true
                ftpWatts -= ftpWatts * (weeks * settings.strava.ftp.idleLossPerWeek)
            }

            // Round FTP.
            ftpWatts = Math.round(ftpWatts)

            logger.info("Strava.estimateFtp", `User ${user.id} ${user.displayName}`, `Estimated FTP ${ftpWatts}w${adjusted ? " (adjusted)" : ""}, current ${currentWatts}w, highest effort ${maxWatts}w`)

            return {
                ftpWatts: ftpWatts,
                ftpCurrentWatts: currentWatts,
                bestWatts: maxWatts,
                bestActivity: bestActivity,
                activityCount: listWatts.length,
                activityWattsAvg: avgWatts,
                recentlyUpdated: recentlyUpdated
            }
        } catch (ex) {
            logger.error("Strava.estimateFtp", `User ${user.id} ${user.displayName}`, ex)
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
        if (user.suspended) {
            logger.warn("Strava.checkActivityRecords", `User ${user.id} ${user.displayName} is suspended`)
            return null
        }
        if (user.preferences.privacyMode) {
            logger.debug("Strava.checkActivityRecords", `User ${user.id} ${user.displayName}`, "User has opted in for privacy mode")
            return null
        }
        if (!activities || activities.length == 0) {
            logger.debug("Strava.checkActivityRecords", `User ${user.id} ${user.displayName}`, "No activities to be checked")
            return null
        }

        // Only proceed if athlete has the records document initialized.
        const allRecords = await this.getAthleteRecords(user)
        if (!allRecords) {
            logger.debug("Strava.checkActivityRecords", `User ${user.id} ${user.displayName}`, "No previous records found, will not proceed")
            return null
        }

        const result: StravaAthleteRecords = {}
        const minMovingTime = settings.strava.records.minMovingTimeAvg
        let hasNewRecord = false

        // Iterate the passed activites to check for new records.
        for (let activity of activities) {
            try {
                if (!user.isPro && !settings.plans.free.recordSports.includes(activity.type)) {
                    logger.debug("Strava.checkActivityRecords", `User ${user.id} ${user.displayName}`, `Activity ${activity.id} ${activity.type} not tracked on free accounts`)
                    continue
                }

                if (!allRecords[activity.type]) {
                    allRecords[activity.type] = {}
                }

                const currentRecords: StravaRecords = allRecords[activity.type]
                const movingTime = activity.movingTime || 0

                // If activity had no power meter, exclude the power based records.
                // Check all of the possible record properties.
                const props = activity.hasPower ? StravaTrackedRecords : StravaTrackedRecords.filter((r) => !r.includes("watts"))
                for (let prop of props) {
                    const currentValue: number = currentRecords[prop] ? currentRecords[prop].value || 0 : 0

                    // Has broken a new record? If an average-based metric, was the
                    // activity longer than the minMovingTimeAvg setting?
                    if (activity[prop] && activity[prop] > currentValue) {
                        if (prop.includes("Avg") && movingTime < minMovingTime) {
                            logger.debug("Strava.checkActivityRecords", `User ${user.id} ${user.displayName}`, prop, `Activity ${activity.id} has less than ${minMovingTime}`)
                            continue
                        }

                        // Make sure the new records references exist.
                        if (!result[activity.type]) result[activity.type] = {}
                        if (!activity.newRecords) activity.newRecords = []

                        const details: StravaRecordDetails = {
                            value: activity[prop],
                            previous: currentValue,
                            activityId: activity.id,
                            date: activity.dateEnd
                        }

                        allRecords[activity.type][prop] = details
                        result[activity.type][prop] = details
                        activity.newRecords.push(prop)

                        hasNewRecord = true
                    }
                }
            } catch (ex) {
                logger.error("Strava.checkActivityRecords", `User ${user.id} ${user.displayName}`, `Activity ${activity.id}`, ex)
            }
        }

        // User has broken a personal record? Save it.
        if (hasNewRecord) {
            await this.setAthleteRecords(user, result)
            return result
        } else {
            logger.debug("Strava.checkActivityRecords", `User ${user.id} ${user.displayName}`, `${activities.length} activities`, `No new records`)
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
                const entries = Object.entries(records).filter((k) => !["id", "dateCreated"].includes(k[0]))
                const count = _.sum(entries.map((entry) => Object.keys(entry[1]).length))

                if (count > 0) {
                    logger.info("Strava.getAthleteRecords", `User ${user.id} ${user.displayName}`, `${count} records`)
                }
            } else {
                logger.debug("Strava.getAthleteRecords", `User ${user.id} ${user.displayName} has no records saved`)
            }

            return records || null
        } catch (ex) {
            logger.error("Strava.getAthleteRecords", `User ${user.id} ${user.displayName}`, ex)
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
                logger.info("Strava.setAthleteRecords", `User ${user.id} ${user.displayName}`, "No new records to be saved")
                return
            }

            const sports = Object.keys(records)

            // Log new records by sport.
            for (let sport of sports) {
                const recordsLog = _.map(_.toPairs(records[sport]), (r) => `${r[0]}=${r[1]["value"]}`).join(" | ")
                logger.info("Strava.setAthleteRecords", `User ${user.id} ${user.displayName}`, sport, recordsLog)
            }

            // Set document ID and save to the database.
            records.id = user.id as any
            await database.merge("athlete-records", records)
        } catch (ex) {
            logger.error("Strava.setAthleteRecords", `User ${user.id} ${user.displayName}`, ex)
        }
    }

    /**
     * Prepare the athlete records using the profile stats / totals as a baseline.
     * @param user The user account.
     */
    prepareAthleteRecords = async (user: UserData): Promise<void> => {
        try {
            if (user.preferences.privacyMode) {
                logger.info("Strava.prepareAthleteRecords", `User ${user.id} ${user.displayName}`, "User has opted in for privacy mode")
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
                        distance: {value: stats.distance / stats.count, previous: 0}
                    }
                }
            }

            // Extra ride stats.
            if (profileStats.allRideTotals && profileStats.allRideTotals.distance > 0) {
                records.Ride = {
                    distance: {value: profileStats.biggestRideDistance, previous: 0}
                }
            }

            logger.info("Strava.prepareAthleteRecords", `User ${user.id} ${user.displayName}`, `${sportCount || "no"} baseline sports created`)

            // Save base document to the database.
            await database.set("athlete-records", records, user.id)
        } catch (ex) {
            logger.error("Strava.prepareAthleteRecords", `User ${user.id} ${user.displayName}`, ex)
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
            logger.info("Strava.deleteAthleteRecords", `User ${user.id} ${user.displayName}`, `${count ? "Deleted" : "No records to delete"}`)

            return count > 0
        } catch (ex) {
            logger.error("Strava.deleteAthleteRecords", `User ${user.id} ${user.displayName}`, ex)
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
                    await users.suspend(user)
                }
            }
        } catch (ex) {
            logger.error("Strava.deauthCheck", userId, ex)
        }
    }
}

// Exports...
export default StravaAthletes.Instance
