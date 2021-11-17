// Strautomator Core: Strava Athletes

import {StravaActivity, StravaEstimatedFtp, StravaGear, StravaProfile, StravaSport, StravaTokens} from "./types"
import {toStravaGear, toStravaProfile} from "./utils"
import {UserData} from "../users/types"
import users from "../users"
import api from "./api"
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
     * Get gear details from Strava.
     * @param user User data.
     * @param id The gear ID string.
     */
    getGear = async (user: UserData, id: string): Promise<StravaGear> => {
        logger.debug("Strava.getGear", id)

        try {
            const data = await api.get(user.stravaTokens, `gear/${id}`)
            const gear = toStravaGear(user.profile, data)

            logger.info("Strava.getGear", `User ${user.id} ${user.displayName}`, `Gear ${id}: ${gear.name} - distance ${gear.distance}`)
            return gear
        } catch (ex) {
            logger.error("Strava.getGear", id, ex)
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
