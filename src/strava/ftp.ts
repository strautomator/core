// Strautomator Core: Strava Activities

import {StravaActivity, StravaEstimatedFtp, StravaSport} from "./types"
import {UserData} from "../users/types"
import stravaActivities from "./activities"
import stravaAthletes from "./athletes"
import api from "./api"
import users from "../users"
import _ = require("lodash")
import logger = require("anyhow")
import dayjs from "../dayjs"
const settings = require("setmeup").settings

/**
 * Strava activities manager.
 */
export class StravaFtp {
    private constructor() {}
    private static _instance: StravaFtp
    static get Instance(): StravaFtp {
        return this._instance || (this._instance = new this())
    }

    /**
     * Estimate the user's FTP based on the passed activities.
     * @param user The user to estimate the FTP for.
     * @param activities List of activities to be used for the estimation.
     */
    estimateFtp = async (user: UserData, activities?: StravaActivity[]): Promise<StravaEstimatedFtp> => {
        try {
            if (!activities || activities.length == 0) {
                const dateAfter = dayjs.utc().subtract(settings.strava.ftp.weeks, "weeks")
                const tsAfter = dateAfter.valueOf() / 1000
                const tsBefore = new Date().valueOf() / 1000
                activities = await stravaActivities.getActivities(user, {before: tsBefore, after: tsAfter})
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
                // 104% for each extra hour of activity time.
                if (totalTime <= 3600) {
                    const perc = ((3600 - totalTime) / 60 / 8) * 0.01
                    power = Math.round(watts * (1 - perc))
                } else {
                    const extraHours = Math.floor(totalTime / 3600) - 1
                    const fraction = 1 + 0.04 * ((totalTime % 3600) / 60 / 60)
                    const factor = 1.04 ** extraHours * fraction
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
                const athlete = await stravaAthletes.getAthlete(user.stravaTokens)
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
                const currentWattsWeight = [currentWatts, 1.35]
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

            logger.info("Strava.estimateFtp", `User ${user.id} ${user.displayName}`, `Estimated FTP from ${activities.length} activities: ${ftpWatts}w${adjusted ? " (adjusted)" : ""}, current ${currentWatts}w, highest effort ${maxWatts}w`)

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

    /**
     * Update the user's FTP.
     * @param user User data.
     * @param ftp The FTP (as number).
     * @param force Force update, even if FTP was updated recently or is still the same value.
     */
    saveFtp = async (user: UserData, ftp: number, force?: boolean): Promise<boolean> => {
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
                        logger.warn("Strava.saveFtp", `User ${user.id} ${user.displayName}`, `FTP ${ftp}`, `Abort, FTP was already updated recently`)
                        return false
                    }
                }

                // Only update the FTP if it was changed by at least 1%.
                const percentChanged = 100 * Math.abs((ftp - user.profile.ftp) / ((ftp + user.profile.ftp) / 2))
                if (percentChanged < 1) {
                    logger.warn("Strava.saveFtp", `User ${user.id} ${user.displayName}`, `Only ${percentChanged}% changed, won't update`)
                    return false
                }
            }

            // All good? Update FTP on Strava and save date to the database.
            await api.put(user.stravaTokens, `athlete`, {ftp: ftp})
            await users.update({id: user.id, displayName: user.displayName, dateLastFtpUpdate: new Date()})
            logger.info("Strava.saveFtp", `User ${user.id} ${user.displayName}`, `FTP ${ftp}`)

            return true
        } catch (ex) {
            logger.error("Strava.saveFtp", ex)
        }
    }

    /**
     * Process the user's FTP, and save only if it has changed by more than 1%.
     * @param user User data.
     */
    processFtp = async (user: UserData): Promise<void> => {
        try {
            const ftpEstimation = await this.estimateFtp(user)

            if (ftpEstimation) {
                const threshold = ftpEstimation.ftpCurrentWatts * 0.01

                if (!ftpEstimation.recentlyUpdated && Math.abs(ftpEstimation.ftpWatts - ftpEstimation.ftpCurrentWatts) > threshold) {
                    await this.saveFtp(user, ftpEstimation.ftpWatts)
                }
            }
        } catch (ex) {
            logger.error("Strava.processFtp", `User ${user.id} ${user.displayName}`, ex)
        }
    }
}

// Exports...
export default StravaFtp.Instance
