// Strautomator Core: Strava Activities

import {StravaActivity, StravaActivityPerformance, StravaEstimatedFtp, StravaFitnessLevel, StravaSport} from "./types"
import {UserData, UserFtpStatus} from "../users/types"
import stravaActivities from "./activities"
import stravaAthletes from "./athletes"
import api from "./api"
import users from "../users"
import _ from "lodash"
import logger from "anyhow"
import * as logHelper from "../loghelper"
import dayjs from "../dayjs"
const settings = require("setmeup").settings

/**
 * Strava activities manager.
 */
export class StravaPerformance {
    private constructor() {}
    private static _instance: StravaPerformance
    static get Instance(): StravaPerformance {
        return this._instance || (this._instance = new this())
    }

    /**
     * Process the user's FTP and fitness level according to the passed activities. Will fetch recent activities
     * in case none was passed.
     * @param user User data.
     * @param activities Optional activities to be processed.
     * @param skipIntervals Optional, set to skip checking 5 / 20 / 60min power intervals.
     */
    processPerformance = async (user: UserData, activities?: StravaActivity[], skipIntervals?: boolean): Promise<void> => {
        try {
            const now = dayjs().utc()

            // Get recent activities if none was passed. Will use the highest value (FTP or fitness level weeks).
            if (!activities || activities.length == 0) {
                const weeks = _.max([settings.strava.ftp.weeks, settings.strava.fitnessLevel.weeks])
                const dateFrom = now.subtract(weeks, "weeks").startOf("day")
                const dateTo = now.subtract(1, "second")
                activities = await stravaActivities.getActivities(user, {after: dateFrom, before: dateTo})
            }

            // First we estimate the user's FTP.
            const ftpEstimation = await this.estimateFtp(user, activities, skipIntervals)
            if (!ftpEstimation) {
                logger.warn("Strava.processPerformance", logHelper.user(user), "Could not estimate the user's FTP")
            } else if (ftpEstimation.recentlyUpdated) {
                logger.warn("Strava.processPerformance", logHelper.user(user), "FTP already updated recently")
            } else {
                await this.saveFtp(user, ftpEstimation)
            }

            // Then we check the fitness level, but only if we have at least 4 activities and with
            // at least 1/2 of the default fitness level weeks value.
            const minDate = now.subtract(settings.strava.fitnessLevel.weeks / 2, "weeks")
            if (activities.length >= 4 && activities.find((a) => minDate.isAfter(a.dateStart))) {
                const fitnessLevel = await this.estimateFitnessLevel(user, activities)

                if (user.fitnessLevel != fitnessLevel) {
                    user.fitnessLevel = fitnessLevel
                    await users.update({id: user.id, displayName: user.displayName, fitnessLevel: fitnessLevel})
                }
            }
        } catch (ex) {
            logger.error("Strava.processPerformance", logHelper.user(user), ex)
        }
    }

    // FITNESS LEVEL
    // --------------------------------------------------------------------------

    /**
     * Estimate the user's fitness level using a combination of speed, wattage and training hours.
     * At the moment biased towards endurance sports (rides and runs) where volume is usually higher.
     * @param user The user data.
     * @param activities Optional activities to consider, if not passed will get latest for the last few weeks.
     */
    estimateFitnessLevel = async (user: UserData, activities?: StravaActivity[]): Promise<StravaFitnessLevel> => {
        const levels = {
            speed: StravaFitnessLevel.Untrained,
            wattsPerKg: StravaFitnessLevel.Untrained,
            hoursPerWeek: StravaFitnessLevel.Untrained,
            daysPerWeek: StravaFitnessLevel.Untrained
        }

        try {
            const maxLevel = 5
            const femaleMultiplier = 0.85
            let totalTime = 0
            let weeks = 0

            // Get activities for the past 14 weeks (value set in settings) if none was passed.
            if (!activities || activities.length == 0) {
                weeks = settings.strava.fitnessLevel.weeks
                activities = await stravaActivities.getActivities(user, {after: dayjs().subtract(weeks, "weeks").startOf("day")})
            } else {
                const minDate = _.minBy(activities, "dateStart").dateStart
                const maxDate = _.maxBy(activities, "dateStart").dateStart
                weeks = dayjs(maxDate).diff(minDate, "weeks")
            }

            // Speed in KPH to reach Pro, Athletic and Average fitness levels for individual sport types.
            const speedIndex = {
                [StravaSport.Ride]: [0, 25, 35, 40, 44],
                [StravaSport.VirtualRide]: [0, 27, 37, 42, 46],
                [StravaSport.GravelRide]: [0, 18, 28, 34, 40],
                [StravaSport.MountainBikeRide]: [0, 10, 20, 26, 30],
                [StravaSport.Run]: [0, 10, 14, 17, 19],
                [StravaSport.VirtualRun]: [0, 11, 15, 18, 20]
            }

            // Cycling and running wattage expected to reach Pro, Athletic and Average fitness levels.
            const wattsIndex = {
                Ride: [0, 2.1, 3.2, 4.2, 5.1],
                Run: [0, 2.6, 3.8, 4.8, 5.5]
            }

            // Helper to get the fitness level for a specific attribute / index.
            // Females will have the targets reduced by 15% compared to males.
            const checkLevels = (index: any, value: number, levelField: string): void => {
                for (let i = maxLevel; i--; i > 0) {
                    let target = index[i - 1]
                    if (user.profile.sex == "F") {
                        target = target * femaleMultiplier
                    }
                    if (value > target && i > levels[levelField]) {
                        levels[levelField] = i
                    }
                }
            }

            // Iterate and process activities.
            for (let activity of activities) {
                totalTime += activity.movingTime || activity.totalTime || 0

                const isRide = activity.sportType.includes("Ride")
                const isRun = activity.sportType.includes("Run")
                const minMovingTime = isRide ? settings.strava.fitnessLevel.minRideTime : settings.strava.fitnessLevel.minRunTime

                // Avoid processing manual or very short activities as they might give overly optimistic results.
                if (activity.manual || ((isRide || isRun) && activity.movingTime < minMovingTime)) {
                    logger.debug("Strava.estimateFitnessLevel", logHelper.user(user), `Activity ${activity.id} too short: ${activity.movingTimeString}`)
                    continue
                }

                // First we get the speed score for various types of activities.
                // Only the very best score will be considered.
                if (speedIndex[activity.sportType]) {
                    checkLevels(speedIndex[activity.sportType], activity.speedAvg, "speed")
                }

                // Now do the same, but for wattage (watts per kilo).
                if (user.profile.weight > 0 && activity.hasPower) {
                    const sportIndex = isRide ? wattsIndex.Ride : isRun ? wattsIndex.Run : null
                    if (sportIndex) {
                        checkLevels(sportIndex, activity.wattsWeighted / user.profile.weight, "wattsPerKg")
                    }
                }
            }

            // Calculate the score based on watts and the user's currently set FTP.
            if (user.profile.weight > 0 && user.profile.ftp > 0) {
                checkLevels(wattsIndex.Ride, user.profile.ftp / user.profile.weight, "wattsPerKg")
            }

            // Calculate the score based on the average hours per week of training.
            const hoursPerWeek = totalTime / weeks / 3600
            if (hoursPerWeek > 20) levels.hoursPerWeek = StravaFitnessLevel.Elite
            else if (hoursPerWeek > 16) levels.hoursPerWeek = StravaFitnessLevel.Pro
            else if (hoursPerWeek > 10) levels.hoursPerWeek = StravaFitnessLevel.Athletic
            else if (hoursPerWeek > 2) levels.hoursPerWeek = StravaFitnessLevel.Average

            // Calculate the score based on the average number of active days per week.
            // If a user does more than 1 activity per day, only a partial extra day will be counted.
            const uniqueDays = _.uniq(activities.map((a) => dayjs(a.dateStart).format("YYYY-MM-DD"))).length
            const activeDays = (uniqueDays * 3 + activities.length) / 4
            const daysPerWeek = activeDays / weeks
            if (daysPerWeek > 6) levels.daysPerWeek = StravaFitnessLevel.Elite
            else if (daysPerWeek > 5) levels.daysPerWeek = StravaFitnessLevel.Pro
            else if (daysPerWeek > 3) levels.daysPerWeek = StravaFitnessLevel.Athletic
            else if (daysPerWeek > 1) levels.daysPerWeek = StravaFitnessLevel.Average
        } catch (ex) {
            logger.error("Strava.estimateFitnessLevel", logHelper.user(user), ex)
        }

        // To get the final score (fitness level), we remove the worst score, sum the rest,
        // and divide by the number of the remaining scores.
        const arrLevels = Object.values(levels)
        const totalScore = _.sum(arrLevels) - _.min(arrLevels)
        let result = Math.round(totalScore / (arrLevels.length - 1))

        // If the fitness level decreased, use the current level as part of the final calculation.
        if (!_.isNil(user.fitnessLevel) && result < user.fitnessLevel) {
            result = Math.round((totalScore + user.fitnessLevel) / (arrLevels.length - 1))
        }

        const logLevels = Object.entries(levels).map(([key, value]) => `${key}: ${value}`)
        logger.info("Strava.estimateFitnessLevel", logHelper.user(user), StravaFitnessLevel[result], logLevels.join(", "))
        return result
    }

    // FTP
    // --------------------------------------------------------------------------

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
                    const minPowerDate = now.subtract(settings.strava.ftp.weeks, "weeks").startOf("day")
                    if (!skipIntervals && user.isPro && minPowerDate.isBefore(a.dateStart)) {
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

            logger.info("Strava.estimateFtp", logHelper.user(user), `Estimated FTP from ${activityCount} activities: ${ftpWatts}w, current ${currentWatts}w, best activity ${bestActivity?.id || "none"}`)

            return {
                ftpWatts: ftpWatts,
                ftpCurrentWatts: currentWatts,
                bestWatts: maxWatts,
                bestActivity: bestActivity || null,
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
                activityId: ftpEstimation.bestActivity?.id || null,
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
                logger.info("Strava.getPowerIntervals", logHelper.user(user), logHelper.activity(activity), "Abort, not enough data points")
                return null
            }
            if (streams.watts.resolution == "low" || streams.watts.data.length < activity.movingTime * 0.8) {
                logger.info("Strava.getPowerIntervals", logHelper.user(user), logHelper.activity(activity), "Abort, resolution not good enough")
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
export default StravaPerformance.Instance
