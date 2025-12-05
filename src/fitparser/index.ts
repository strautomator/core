// Strautomator Core: FIT Parser
// Largely based on https://github.com/jimmykane/fit-parser

import {Decoder, Stream} from "./sdk"
import {FitFileActivity} from "./types"
import {DatabaseSearchOptions} from "../database/types"
import {StravaActivity, StravaProcessedActivity} from "../strava/types"
import {UserData} from "../users/types"
import database from "../database"
import _ from "lodash"
import logger from "anyhow"
import jaul from "jaul"
import * as logHelper from "../loghelper"
import dayjs from "../dayjs"
const settings = require("setmeup").settings

/**
 * FIT file parser and manager.
 */
export class FitParser {
    private constructor() {}
    private static _instance: FitParser
    static get Instance() {
        return this._instance || (this._instance = new this())
    }

    /**
     * Parse the specified FIT raw data.
     * @param user The user.
     * @param fitFileActivity The FIT file activity to have the data appended to.
     * @param rawData The FIT raw data.
     */
    async parse(user: UserData, fitFileActivity: FitFileActivity, rawData: any) {
        const stream = Stream.fromByteArray(rawData)
        if (!Decoder.isFIT(stream)) {
            throw new Error("Not a valid FIT file")
        }

        const decoder = new Decoder(stream)
        if (!decoder.checkIntegrity()) {
            throw new Error("FIT file integrity check failed")
        }

        const {messages, errors} = decoder.read()
        if (errors.length > 0) {
            const logErrors = errors.map((e) => e.message || e.toSting()).join(", ")
            logger.warn("FitParser.parse", logHelper.user(user), fitFileActivity.id, `Parsing errors: ${logErrors}`)
        }

        // Extract duration and distance from sessions.
        if (messages.sessionMesgs?.length > 0) {
            const sessions = messages.sessionMesgs

            fitFileActivity.distance = parseFloat((_.sumBy(sessions, "totalDistance") / 1000).toFixed(1))
            fitFileActivity.totalTime = Math.round(_.sumBy(sessions, "totalElapsedTime"))

            // Map our target activity fields to the FIT file fields.
            const fields = {
                primaryBenefit: "primaryBenefit",
                intensityFactor: "intensityFactor",
                tss: "trainingStressScore",
                trainingLoad: "trainingLoadPeak",
                aerobicTrainingEffect: "totalTrainingEffect",
                anaerobicTrainingEffect: "totalAnaerobicTrainingEffect",
                pedalSmoothness: ["avgCombinedPedalSmoothness", "avgLeftPedalSmoothness", "avgRightPedalSmoothness"],
                pedalTorqueEffect: ["avgLeftTorqueEffectiveness", "avgRightTorqueEffectiveness"],
                pedalBalance: "leftRightBalance"
            }

            // Append extra activity data from sessions.
            for (let session of sessions) {
                for (let field in fields) {
                    let fieldKey = fields[field]
                    let value: number

                    // If the field key is an array, get the average of the values.
                    if (_.isArray(fields[field])) {
                        const filteredSession = _.pick(session, fields[field])
                        const sessionValues = _.without(Object.values(filteredSession), null, undefined)
                        if (sessionValues.length > 0) {
                            value = _.mean(sessionValues)
                        }
                    } else {
                        value = session[fieldKey]
                    }
                    if (!fitFileActivity[field] && !_.isNil(value)) {
                        fitFileActivity[field] = value
                    }
                }
            }
        }

        // Get Sport profile.
        if (messages.sportMesgs?.length > 0) {
            fitFileActivity.sportProfile = messages.sportMesgs.map((sp) => (Array.isArray(sp.name) ? sp.name[0] : sp.name)).join(", ")
        }

        // Add workout details.
        if (messages.workoutMesgs?.length > 0) {
            fitFileActivity.workoutName = messages.workoutMesgs.map((wk) => (Array.isArray(wk.wktName) ? wk.wktName[0] : wk.wktName)).join(", ")
            fitFileActivity.workoutNotes = messages.workoutMesgs.map((wk) => (Array.isArray(wk.wktDescription) ? wk.wktDescription[0] : wk.wktDescription)).join(", ")
        }

        // Found devices in the FIT file? Generate device IDs.
        if (messages.deviceInfoMesgs?.length > 0) {
            const filter = (d) => (d.manufacturer || d.antplusDeviceType || d.bleDeviceType) && d.serialNumber
            const validDevices = _.uniqBy(messages.deviceInfoMesgs.filter(filter), (d: any) => this.getDeviceString(d))
            fitFileActivity.devices = validDevices.map((d) => this.getDeviceString(d))

            // Identify devices battery statuses, also including the creator device details.
            const batteryDevices = validDevices.filter((d) => d.batteryStatus || d.deviceIndex == "creator")
            if (batteryDevices.length > 0) {
                fitFileActivity.deviceBattery = batteryDevices.map((d) => {
                    return {
                        id: this.getDeviceString(d),
                        status: d.batteryStatus || "ok"
                    }
                })
            }
        }

        // Parse split summaries, only consider active splits (had changes in speed, ascent or descent).
        if (messages.splitMesgs?.length > 0) {
            const activeSplits = messages.splitMesgs.filter((s) => s.avgSpeed > 0 || s.totalAscent > 0 || s.totalDescent > 0)
            fitFileActivity.splits = activeSplits.map((s) => {
                const split = {
                    splitType: s.splitType
                        ? s.splitType
                              .toString()
                              .replace(/([A-Z])/g, " $1")
                              .replace(/^./, (f) => f.toUpperCase())
                        : null,
                    totalTime: s.totalElapsedTime ? dayjs.duration(s.totalElapsedTime, "seconds").format("HH:mm:ss") : "00:00:00",
                    speedAvg: s.avgSpeed,
                    distance: s.totalDistance,
                    ascent: s.totalAscent,
                    descent: s.totalDescent,
                    calories: s.totalCalories
                }
                return _.omitBy(split, (v) => _.isNil(v))
            })
        }

        // Decode primary benefit to a friendly string.
        if (fitFileActivity.primaryBenefit) {
            const primaryBenefits = ["None", "Recovery", "Base", "Tempo", "Threshold", "VO2Max", "Anaerobic", "Sprint"]
            fitFileActivity.primaryBenefit = primaryBenefits[fitFileActivity.primaryBenefit]
        }

        // Round relevant fields.
        for (let field of ["trainingLoad", "pedalSmoothness", "pedalTorqueEffect"]) {
            if (fitFileActivity[field]) {
                fitFileActivity[field] = Math.round(fitFileActivity[field])
            }
        }

        // Decode L/R balance, only right-power based calculation is supported for now.
        const balance = fitFileActivity.pedalBalance as any
        if (balance?.right && balance?.value <= 10000) {
            const right = Math.round(balance.value / 100)
            const left = 100 - right
            fitFileActivity.pedalBalance = `L ${left}% / R ${right}%`
        } else {
            delete fitFileActivity.pedalBalance
        }

        logger.info("FitParser.parse", logHelper.user(user), logHelper.fitFileActivity(fitFileActivity, true))
    }

    // DATABASE DATA
    // --------------------------------------------------------------------------

    /**
     * Search for processed FIT activities in the database based on user and (optional) start date.
     * @param user The user.
     * @param source The source of the FIT file (garmin or wahoo).
     * @param options Search query options (dateFrom and dateTo).
     */
    getProcessedActivities = async (user: UserData, source: "garmin" | "wahoo", options: DatabaseSearchOptions): Promise<FitFileActivity[]> => {
        try {
            const where: any[] = [["userId", "==", user.id]]

            // Filter by start date.
            if (options.dateFrom) {
                where.push(["dateStart", ">=", options.dateFrom])
            }
            if (options.dateTo) {
                where.push(["dateStart", "<=", options.dateTo])
            }

            const result = await database.search(source, where)

            // Log additional where date clauses.
            where.shift()
            const logWhere = where.length > 0 ? where.map((w) => w.map((i) => i.toISOString()).join(" ")).join(", ") : "No date filter"
            logger.info("FitParser.getProcessedActivities", logHelper.user(user), source, logWhere, `Got ${result?.length || "no"} activities`)

            return result
        } catch (ex) {
            logger.error("FitParser.getProcessedActivities", logHelper.user(user), source, ex)
        }
    }

    /**
     * Find a matching FIT file activity in the database.
     * @param user The user.
     * @param activity The Strava activity to be matched.
     * @param source Optional specific source, garmin or wahoo.
     */
    getMatchingActivity = async (user: UserData, activity: StravaActivity | StravaProcessedActivity, source?: "any" | "garmin" | "wahoo"): Promise<FitFileActivity> => {
        const debugLogger = user.debug ? logger.warn : logger.debug

        try {
            if (!activity) {
                logger.warn("FitParser.getMatchingActivity", logHelper.user(user), source, "Empty or invalid activity provided")
                return
            }

            if (!source) source = "any"

            const activityDate = dayjs(activity.dateStart)
            const dateFrom = activityDate.subtract(1, "minute").toDate()
            const dateTo = activityDate.add(1, "minute").toDate()
            const where: any[] = [
                ["userId", "==", user.id],
                ["dateStart", ">=", dateFrom],
                ["dateStart", "<=", dateTo]
            ]

            // Find activities based on the start date.
            // No activities found? Try again once if the activity device matches the passed FIT file source.
            let activities: FitFileActivity[]
            if (source == "any") {
                const fromGarmin = await database.search("garmin", where)
                const fromWahoo = await database.search("wahoo", where)
                activities = _.concat(fromGarmin, fromWahoo)
            } else {
                activities = await database.search(source, where)
                if (activities.length == 0 && activity.device?.toLowerCase().includes(source)) {
                    await jaul.io.sleep(settings.axios.retryInterval * 2)
                    activities = await database.search(source, where)
                }
            }

            if (activities.length == 0) {
                debugLogger("FitParser.getMatchingActivity", logHelper.user(user), source, logHelper.activity(activity), "Not found")
                return null
            }

            // Make sure activity is the correct one.
            const minTime = activity.totalTime - 60
            const maxTime = activity.totalTime + 60
            const result = activities.find((a) => a.totalTime >= minTime && a.totalTime <= maxTime)
            if (!result) {
                const logActivityIds = `Activities: ${activities.map((a) => a.id).join(", ")}`
                const logTotalTime = `Similar start date but different total time (${activity.totalTime})`
                logger.warn("FitParser.getMatchingActivity", logHelper.user(user), source, logHelper.activity(activity), logActivityIds, logTotalTime)
                return null
            }

            logger.info("FitParser.getMatchingActivity", logHelper.user(user), source, logHelper.activity(activity), `Matched: ${logHelper.fitFileActivity(result)}`)
            return result
        } catch (ex) {
            logger.error("FitParser.getMatchingActivity", logHelper.user(user), source, logHelper.activity(activity), ex)
        }
    }

    /**
     * Save the the processed FIT file activity to the database.
     * @param user The user.
     * @param source The source of the FIT file (garmin or wahoo).
     * @param data The FIT file activity data.
     */
    saveProcessedActivity = async (user: UserData, source: "garmin" | "wahoo", activity: FitFileActivity): Promise<void> => {
        try {
            if (!activity.dateExpiry) {
                activity.dateExpiry = dayjs().add(settings[source].maxCacheDuration, "seconds").toDate()
            }

            await database.set(source, activity, `activity-${activity.id}`)

            const logDevices = activity.devices ? activity.devices.length : "no"
            logger.info("FitParser.saveProcessedActivity", logHelper.user(user), source, logHelper.fitFileActivity(activity), `${logDevices} devices`)
        } catch (ex) {
            logger.error("FitParser.saveProcessedActivity", logHelper.user(user), source, logHelper.fitFileActivity(activity), ex)
        }
    }

    // HELPERS
    // --------------------------------------------------------------------------

    /**
     * Get a friendly device string based on the provided device info message.
     * @param d The device info message.
     */
    private getDeviceString = (d) => {
        const brand = d.manufacturer || "generic"
        const antId = d.antId || d.antDeviceNumber
        const deviceId = antId ? `${d.serialNumber}.${antId}` : d.serialNumber
        const deviceName = d.garminProduct || d.faveroProduct || d.shimanoProduct || d.productName || d.antplusDeviceType || d.bleDeviceType || d.localDeviceType || d.sourceType

        return `${brand}.${deviceName}.${deviceId}`.replace(/\_/g, "").replace(/\s/g, "").toLowerCase()
    }
}

// Exports...
export default FitParser.Instance
