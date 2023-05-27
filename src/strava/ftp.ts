// Strautomator Core: Strava Activities

import {StravaActivity, StravaActivityPerformance, StravaEstimatedFtp, StravaSport} from "./types"
import {UserData, UserFtpStatus} from "../users/types"
import stravaActivities from "./activities"
import stravaAthletes from "./athletes"
import api from "./api"
import users from "../users"
import _ from "lodash"
import logger = require("anyhow")
import * as logHelper from "../loghelper"
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
     * @param skipIntervals Optional, set to skip checking 5 / 20 / 60min power intervals.
     */
    estimateFtp = async (user: UserData, activities?: StravaActivity[], skipIntervals?: boolean): Promise<StravaEstimatedFtp> => {
        let activityCount: number = 0

        try {
            const now = dayjs().utc()
            const twoWeeksAgo = now.subtract(14, "days")
            const bikeTypes = [StravaSport.Ride, StravaSport.GravelRide, StravaSport.MountainBikeRide, StravaSport.VirtualRide]

            if (!activities || activities.length == 0) {
                const dateFrom = now.subtract(settings.strava.ftp.weeks, "weeks").startOf("day")
                const dateTo = now.subtract(1, "second")
                activities = await stravaActivities.getActivities(user, {after: dateFrom, before: dateTo})
            }

            // Filter only activities since the last FTP status.
            // We add a 100 buffer to the activity ID in the (very rare) case where an activity is
            // created earlier but processed later than the one which triggered the last FTP update.
            if (user.ftpStatus) {
                activities = activities.filter((a) => a.id >= user.ftpStatus.activityId - 100)
            }

            // Filter only cycling activities with good power data and that lasted at least 20 minutes.
            activities = activities.filter((a) => bikeTypes.includes(a.type) && a.hasPower && a.movingTime > 1200)
            activityCount = activities.length

            // No valid activities? Stop here.
            if (activityCount == 0) {
                logger.info("Strava.estimateFtp", logHelper.user(user), "No recent activities with power, can't estimate")
                return null
            }

            // Make sure we have the very latest athlete data.
            try {
                const athlete = await stravaAthletes.getAthlete(user.stravaTokens)
                user.profile.ftp = athlete.ftp
            } catch (athleteEx) {
                logger.warn("Strava.estimateFtp", logHelper.user(user), "Could not get latest athlete data, will use the cache")
            }

            let listWatts: number[] = []
            let avgWatts: number = 0
            let maxWatts: number = 0
            let ftpWatts: number = 0
            let currentWatts: number = 0
            let bestActivity: StravaActivity
            let lastActivityDate = user.dateLastActivity || user.dateRegistered

            // Helper to process the activity and get power stats.
            const processActivity = async (a: StravaActivity): Promise<void> => {
                try {
                    const dateEnd = dayjs(a.dateEnd)

                    // Date of the last activity.
                    if (dateEnd.isAfter(lastActivityDate)) {
                        lastActivityDate = a.dateEnd
                    }

                    let watts = a.wattsWeighted > a.wattsAvg ? a.wattsWeighted : a.wattsAvg
                    let power: number

                    // Low effort activities (less than 60% FTP or current best activity) are not processed.
                    if (watts < user.profile.ftp * 0.6 || watts < maxWatts * 0.6) {
                        logger.info("Strava.estimateFtp", logHelper.user(user), `Activity ${a.id} power is too low: (${watts}), won't process`)
                        return
                    }

                    // FTP ranges from 94% to 100% from 20 minutes to 1 hour, and then
                    // 103.5% for each extra hour of activity time.
                    if (a.movingTime <= 3600) {
                        const perc = ((3600 - a.movingTime) / 60 / 8) * 0.011
                        power = Math.round(watts * (1 - perc))
                    } else {
                        const extraHours = Math.floor(a.movingTime / 3600) - 1
                        const fraction = 1 + 0.035 * ((a.movingTime % 3600) / 60 / 60)
                        const factor = 1.035 ** extraHours * fraction
                        power = watts * factor
                    }

                    // PRO users might also get the best power splits from 5 / 20 / 60 min intervals for recent activities.
                    if (!skipIntervals && user.isPro) {
                        const pIntervals = await this.getPowerIntervals(user, a)

                        if (pIntervals) {
                            pIntervals.power5min = Math.round((pIntervals.power5min || 0) * 0.79)
                            pIntervals.power20min = Math.round((pIntervals.power20min || 0) * 0.94)
                            pIntervals.power60min = pIntervals.power60min || 0

                            if (pIntervals.power5min > maxWatts) power = pIntervals.power5min
                            if (pIntervals.power20min > maxWatts) power = pIntervals.power20min
                            if (pIntervals.power60min > maxWatts) power = pIntervals.power60min
                        }
                    }

                    // Small power drop for activities older than 2 weeks.
                    if (dateEnd.isBefore(twoWeeksAgo)) {
                        power -= power * (twoWeeksAgo.diff(dateEnd, "days") * 0.0009)
                    }

                    // New best power?
                    if (power > maxWatts) {
                        maxWatts = power
                        bestActivity = a
                    }

                    listWatts.push(power)
                } catch (activityEx) {
                    logger.error("Strava.estimateFtp", logHelper.user(user), `Activity ${a.id}`, activityEx)
                }
            }

            // Extract and process power data from activities.
            const batchSize = user.isPro ? settings.plans.pro.apiConcurrency : settings.plans.free.apiConcurrency
            while (activities.length) {
                await Promise.all(activities.splice(0, batchSize).map(processActivity))
            }

            avgWatts = Math.round(_.mean(listWatts))
            maxWatts = Math.round(maxWatts)
            currentWatts = user.profile.ftp || 0

            // Calculate weighted average (towards the current FTP).
            // If highest activity FTP is higher than current FTP, set it as the new value.
            // Otherwise get the weighted or current value itself, whatever is the lowest.
            if (currentWatts && currentWatts > maxWatts) {
                const maxWattsWeight = [maxWatts, 1]
                const currentWattsWeight = [currentWatts, 6]
                const ftpWeights = [maxWattsWeight, currentWattsWeight]
                const [ftpTotalSum, ftpWeightSum] = ftpWeights.reduce(([valueSum, weightSum], [value, weight]) => [valueSum + value * weight, weightSum + weight], [0, 0])
                ftpWatts = ftpTotalSum / ftpWeightSum
            } else {
                ftpWatts = maxWatts
            }

            // Check if the FTP was recently updated for that user.
            let recentlyUpdated: boolean = false
            if (user.ftpStatus) {
                const now = dayjs().subtract(settings.strava.ftp.sinceLastHours, "hours").unix()
                const lastUpdate = dayjs(user.ftpStatus.dateUpdated).unix()
                recentlyUpdated = lastUpdate >= now
            }

            // Adjusted loss per week off the bike.
            const weeks = Math.floor(dayjs().diff(lastActivityDate, "d") / 7)
            if (weeks > 0) {
                ftpWatts -= ftpWatts * (weeks * settings.strava.ftp.idleLossPerWeek)
            }

            // Round FTP, looks nicer.
            ftpWatts = Math.round(ftpWatts)

            logger.info("Strava.estimateFtp", logHelper.user(user), `Estimated FTP from ${activityCount} activities: ${ftpWatts}w, current ${currentWatts}w, best activity ${bestActivity.id}`)

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
            logger.error("Strava.estimateFtp", logHelper.user(user), `${activityCount} activities`, ex)
            throw ex
        }
    }

    /**
     * Update the user's FTP.
     * @param user User data.
     * @param ftpEstimation The FTP estimation details.
     * @param force Force update, even if FTP was updated recently or is still the same value.
     */
    saveFtp = async (user: UserData, ftpEstimation: StravaEstimatedFtp, force?: boolean): Promise<boolean> => {
        try {
            const ftp = ftpEstimation.ftpWatts

            if (ftp <= 0) {
                throw new Error("Invalid FTP, must be higher than 0")
            }

            // Updating the FTP via Strautomator is limited to once every 24 hours by default,
            // and only if the value actually changed. Ignore these conditions if force is set.
            if (!force) {
                if (user.ftpStatus) {
                    const sinceLast = dayjs().subtract(settings.strava.ftp.sinceLastHours, "hours").unix()
                    const lastUpdate = dayjs(user.ftpStatus.dateUpdated).unix()

                    if (lastUpdate >= sinceLast) {
                        logger.warn("Strava.saveFtp", logHelper.user(user), `FTP ${ftp}`, `Abort, FTP was updated recently`)
                        return false
                    }
                }

                // Only update the FTP if it was changed by a minimum threshold.
                const percentChanged = (ftp - user.profile.ftp) / ((ftp + user.profile.ftp) / 2)
                if (percentChanged < settings.strava.ftp.saveThreshold) {
                    logger.warn("Strava.saveFtp", logHelper.user(user), `Only ${(percentChanged * 100).toFixed(1)}% changed, won't update`)
                    return false
                }
            }

            const ftpStatus: UserFtpStatus = {
                activityId: ftpEstimation.bestActivity.id,
                previousFtp: ftpEstimation.ftpCurrentWatts,
                dateUpdated: new Date()
            }

            // All good? Update FTP on Strava and save date to the database.
            await api.put(user.stravaTokens, "athlete", {ftp: ftp})
            await users.update({id: user.id, displayName: user.displayName, ftpStatus: ftpStatus})
            logger.info("Strava.saveFtp", logHelper.user(user), `FTP ${ftp}`)

            return true
        } catch (ex) {
            logger.error("Strava.saveFtp", logHelper.user(user), ex)
        }
    }

    /**
     * Estimate and save the user's FTP if necessary.
     * @param user User data.
     * @param activities Optional activities to be processed.
     * @param skipIntervals Optional, set to skip checking 5 / 20 / 60min power intervals.
     */
    processFtp = async (user: UserData, activities?: StravaActivity[], skipIntervals?: boolean): Promise<void> => {
        try {
            const ftpEstimation = await this.estimateFtp(user, activities, skipIntervals)

            if (!ftpEstimation) {
                logger.warn("Strava.processFtp", logHelper.user(user), "Could not estimate the user's FTP")
                return
            }

            if (ftpEstimation.recentlyUpdated) {
                logger.warn("Strava.processFtp", logHelper.user(user), "FTP already updated recently")
                return
            }

            await this.saveFtp(user, ftpEstimation)
        } catch (ex) {
            logger.error("Strava.processFtp", logHelper.user(user), ex)
        }
    }

    // HELPERS
    // --------------------------------------------------------------------------

    /**
     * The the power intervals (1min, 5min, 20min and 1 hour) for the specified activity.
     * @param user User data.
     * @param activity The Strava activity.
     */
    getPowerIntervals = async (user: UserData, activity: StravaActivity): Promise<StravaActivityPerformance> => {
        try {
            if (!activity.hasPower && !activity.wattsAvg) {
                logger.info("Strava.getPowerIntervals", logHelper.user(user), logHelper.activity(activity), "Abort, activity has no power data")
                return null
            }
            if (activity.movingTime < 60) {
                logger.info("Strava.getPowerIntervals", logHelper.user(user), logHelper.activity(activity), "Abort, activity is too short")
                return null
            }

            const streams = await stravaActivities.getStreams(user, activity.id)

            // Missing or not enough power data points? Stop here.
            if (!streams.watts || !streams.watts.data || streams.watts.data.length < 60) {
                logger.info("Strava.getPowerIntervals", logHelper.user(user), logHelper.activity(activity), `Abort, not enough data points`)
                return null
            }
            if (streams.watts.resolution == "low" || streams.watts.data.length < activity.movingTime * 0.8) {
                logger.info("Strava.getPowerIntervals", logHelper.user(user), logHelper.activity(activity), `Abort, resolution not good enough`)
                return null
            }

            const result: StravaActivityPerformance = {}

            const watts = streams.watts.data
            const intervals: StravaActivityPerformance = {
                power5min: 300,
                power20min: 1200,
                power60min: 3600
            }

            // Iterate intervals and then the watts data points to get the
            // highest sum for each interval. This could be improved in the
            // future to iterate the array only once and get the intervals
            // all in a single pass.
            for (let [key, interval] of Object.entries(intervals)) {
                if (watts.length < interval) {
                    continue
                }

                let best = 0

                for (let i = 0; i < watts.length - interval; i++) {
                    const sum = _.sum(watts.slice(i, i + interval))

                    if (sum > best) {
                        best = sum
                    }
                }

                result[key] = Math.round(best / interval)
            }

            const logResult = Object.entries(result).map((r) => `${r[0].replace("power", "")}: ${r[1]}`)
            logger.info("Strava.getPowerIntervals", logHelper.user(user), logHelper.activity(activity), logResult.join(", "))

            return result
        } catch (ex) {
            logger.error("Strava.getPowerIntervals", logHelper.user(user), logHelper.activity(activity), ex)
        }
    }
}

// Exports...
export default StravaFtp.Instance
