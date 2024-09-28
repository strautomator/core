// Strautomator Core: FIT Parser
// Largely based on https://github.com/jimmykane/fit-parser

import {FIT} from "./fit"
import {FitFileActivity} from "./types"
import {getArrayBuffer, calculateCRC, readRecord} from "./binary"
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
     * @param options Optional parsing options.
     */
    async parse(user: UserData, fitFileActivity: FitFileActivity, rawData: any, options?: any) {
        if (!options) {
            options = {
                force: true,
                speedUnit: "m/s",
                lengthUnit: "m",
                temperatureUnit: "celsius",
                elapsedRecordField: false
            }
        }

        const blob = new Uint8Array(getArrayBuffer(rawData))

        if (blob.length < 12) {
            throw new Error("File to small to be a FIT file")
        }

        const headerLength = blob[0]
        if (headerLength !== 14 && headerLength !== 12) {
            throw new Error("Incorrect header size")
        }

        let fileTypeString = ""
        for (let i = 8; i < 12; i++) {
            fileTypeString += String.fromCharCode(blob[i])
        }
        if (fileTypeString !== ".FIT") {
            throw new Error("Missing '.FIT' in header")
        }

        if (headerLength === 14) {
            const crcHeader = blob[12] + (blob[13] << 8)
            const crcHeaderCalc = calculateCRC(blob, 0, 12)
            if (crcHeader !== crcHeaderCalc) {
                logger.warn("FitParser.parse", "Header CRC mismatch", crcHeader, crcHeaderCalc)
            }
        }

        const protocolVersion = blob[1]
        const profileVersion = blob[2] + (blob[3] << 8)
        const dataLength = blob[4] + (blob[5] << 8) + (blob[6] << 16) + (blob[7] << 24)
        const crcStart = dataLength + headerLength
        const crcFile = blob[crcStart] + (blob[crcStart + 1] << 8)
        const crcFileCalc = calculateCRC(blob, headerLength === 12 ? 0 : headerLength, crcStart)

        if (crcFile !== crcFileCalc) {
            logger.warn("FitParser.parse", "File CRC mismatch", crcFile, crcFileCalc)
        }

        const fitObj: any = {}
        fitObj.protocolVersion = protocolVersion
        fitObj.profileVersion = profileVersion

        const sessions = []
        const workoutSteps = []
        const laps = []
        const events = []
        const devices = []
        const applications = []
        const fieldDescriptions = []
        const diveGases = []
        const coursePoints = []
        const sports = []
        const monitors = []
        const stress = []
        const definitions = []
        const fileIds = []
        const monitorInfo = []
        const lengths = []

        let loopIndex = headerLength
        const messageTypes = []
        const developerFields = []

        let startDate
        let lastStopTimestamp
        let pausedTime = 0

        while (loopIndex < crcStart) {
            const {nextIndex, messageType, message} = readRecord(blob, messageTypes, developerFields, loopIndex, options, startDate, pausedTime)
            loopIndex = nextIndex

            if (message) {
                switch (messageType) {
                    case "lap":
                        laps.push(message)
                        break
                    case "session":
                        sessions.push(message)
                        break
                    case "workout_step":
                        workoutSteps.push(message)
                        break
                    case "event":
                        if (message.event === "timer") {
                            if (message.event_type === "stop_all") {
                                lastStopTimestamp = message.timestamp
                            } else if (message.event_type === "start" && lastStopTimestamp) {
                                pausedTime += (message.timestamp - lastStopTimestamp) / 1000
                            }
                        }
                        events.push(message)
                        break
                    case "length":
                        lengths.push(message)
                        break
                    case "field_description":
                        fieldDescriptions.push(message)
                        break
                    case "device_info":
                        devices.push(message)
                        if (!message["product_name"] && message["manufacturer"] && message["product"]) {
                            const productNames = FIT.types.product[message["manufacturer"]]
                            if (productNames && productNames[message["product"]]) {
                                message["product_name"] = productNames[message["product"]]
                            }
                        }
                        break
                    case "developer_data_id":
                        applications.push(message)
                        break
                    case "dive_gas":
                        diveGases.push(message)
                        break
                    case "course_point":
                        coursePoints.push(message)
                        break
                    case "sport":
                        sports.push(message)
                        break
                    case "file_id":
                        fileIds.push(message)
                        break
                    case "definition":
                        definitions.push(message)
                        break
                    case "monitoring":
                        monitors.push(message)
                        break
                    case "monitoring_info":
                        monitorInfo.push(message)
                        break
                    case "stress_level":
                        stress.push(message)
                        break
                    case "software":
                        fitObj.software = message
                        break
                    default:
                        if (messageType !== "") {
                            fitObj[messageType] = message
                        }
                        break
                }
            }
        }

        fitObj.sessions = sessions
        fitObj.workout_steps = workoutSteps
        fitObj.laps = laps
        fitObj.lengths = lengths
        fitObj.events = events
        fitObj.device_infos = devices
        fitObj.developer_data_ids = applications
        fitObj.field_descriptions = fieldDescriptions
        fitObj.dive_gases = diveGases
        fitObj.course_points = coursePoints
        fitObj.sports = sports
        fitObj.devices = devices
        fitObj.monitors = monitors
        fitObj.stress = stress
        fitObj.file_ids = fileIds
        fitObj.monitor_info = monitorInfo
        fitObj.definitions = definitions

        // Extract duration and distance from sessions.
        if (fitObj.sessions?.length > 0) {
            fitFileActivity.distance = parseFloat((_.sumBy(fitObj.sessions, "total_distance") / 1000).toFixed(1))
            fitFileActivity.totalTime = Math.round(_.sumBy(fitObj.sessions, "total_elapsed_time"))

            // Map our target activity fields to the FIT file fields.
            const fields = {
                primaryBenefit: "primary_benefit",
                intensityFactor: "intensity_factor",
                tss: "training_stress_score",
                trainingLoad: "training_load",
                aerobicTrainingEffect: "total_training_effect",
                anaerobicTrainingEffect: "total_anaerobic_effect",
                pedalSmoothness: ["avg_combined_pedal_smoothness", "avg_left_pedal_smoothness", "avg_right_pedal_smoothness"],
                pedalTorqueEffect: ["avg_left_torque_effectiveness", "avg_right_torque_effectiveness"],
                pedalBalance: "left_right_balance"
            }

            // Append extra activity data from sessions.
            for (let session of fitObj.sessions) {
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

            // Get Sport profile.
            for (let sp of fitObj.sports) {
                if (sp.name) {
                    fitFileActivity.sportProfile = sp.name
                }
            }
        }

        // Add workout details.
        if (fitObj.workout?.wkt_name) {
            fitFileActivity.workoutName = fitObj.workout.wkt_name
        }

        // Add workout notes.
        if (fitObj.workout?.notes) {
            fitFileActivity.workoutNotes = fitObj.workout.notes
        }

        // Add workout steps.
        if (fitObj.workout_steps) {
            fitFileActivity.workoutSteps = this.formatWorkoutSteps(fitObj.workout_steps)
        }

        // Found devices in the FIT file? Generate device IDs.
        if (fitObj.devices?.length > 0) {
            const getDeviceString = (d) => `${d.manufacturer}.${d.product_name || d.device_type || d.source_type || d.device_index}.${d.serial_number}`.replace(/\_/g, "").replace(/\s/g, "")
            const validDevices = fitObj.devices.filter((d) => d.manufacturer && d.serial_number)
            fitFileActivity.devices = _.uniq(validDevices.map((d) => getDeviceString(d)))

            // Identify devices battery statuses.
            const batteryDevices = validDevices.filter((d) => d.battery_status)
            if (batteryDevices.length > 0) {
                fitFileActivity.deviceBattery = batteryDevices.map((d) => {
                    return {
                        id: getDeviceString(d),
                        status: d.battery_status
                    }
                })
            }
        }

        // Decode primary benefit to a friendly string.
        if (fitFileActivity.primaryBenefit) {
            const primaryBenefits = ["None", "Recovery", "Base", "Tempo", "Threshold", "VO2Max", "Anaerobic", "Sprint"]
            fitFileActivity.primaryBenefit = primaryBenefits[fitFileActivity.primaryBenefit]
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

        const logFields = Object.keys(fitFileActivity)
        if (fitFileActivity.devices?.length > 0) {
            logFields.push(...fitFileActivity.devices)
        }

        logger.info("FitParser.parse", logHelper.user(user), logHelper.fitFileActivity(fitFileActivity), `Data: ${logFields.join(", ")}`)
    }

    private intensity_prefixes = {
        "warmup": "🟢 Warmup: ",
        "cooldown": "🟡 Cooldown: ",
        "interval": "🚀 Interval: ",
        "rest": "🌿 Rest: ",
    }

    private formatWorkoutSteps(workout_steps: any): string {
        let formatted_step_lines = []

        for (let step of workout_steps) {
            let line = this.intensity_prefixes[step.intensity] || ""

            switch (step.duration_type) {
                case "time":
                    line += this.formatMsTime(step.duration_value)
                    break
                case "repeat_until_steps_cmplt":
                    let rep_start_index = step.duration_value
                    let rep_count = step.target_value

                    let rep_line = `🔄 Repeat ${rep_count}x:`

                    for (var i = rep_start_index; i < formatted_step_lines.length; i++) {
                        formatted_step_lines[i] = "   - " + formatted_step_lines[i]
                    }

                    formatted_step_lines.splice(rep_start_index, 0, rep_line)
                    continue
            }
            
            switch (step.target_type) {
                case "speed":
                    if (step.target_value) {
                        line += ` @ ${this.formatSpeedAsPace(step.target_value)}`
                    } else if (step.custom_target_value_low && step.custom_target_value_high) {
                        let max_pace = this.formatSpeedAsPace(step.custom_target_value_high)
                        let min_pace = this.formatSpeedAsPace(step.custom_target_value_low)
                        line += ` @ ${max_pace}-${min_pace}`
                    }
                    break
            }

            formatted_step_lines.push(line)
        }

        return formatted_step_lines.join("\n")
    }

    private formatMsTime(timeMs: number) {
        if (timeMs < 1000) {
            return "0s"
        }

        let duration_h = (timeMs / 1000 / 60 / 60 ) >> 0;
        let remainder_ms = timeMs % (1000 * 60 * 60)
        let duration_m = (remainder_ms / 1000 / 60) >> 0;
        remainder_ms = remainder_ms % (1000 * 60)
        let duration_s = (remainder_ms / 1000) >> 0;

        let formatted_time = ""
        if (duration_h > 0) {
            formatted_time +=  `${duration_h}h`
        }
        if (duration_m > 0) {
            formatted_time += `${duration_m}min`
        }
        if (duration_s > 0) {
            formatted_time += `${duration_s}s`
        }
        
        return formatted_time
    }

    private formatSpeedAsPace(milliseconds_per_meter) {
        let s_per_km = 1000*1000 / milliseconds_per_meter
        let pace_m_part = (s_per_km / 60) >> 0
        let pace_s_part = (s_per_km % 60) >> 0

        return `${pace_m_part}:${pace_s_part.toString().padStart(2, "0")}/km`
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
        try {
            if (!source) source == "any"

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
                const fromWahoo = await database.search("garmin", where)
                activities = _.concat(fromGarmin, fromWahoo)
            } else {
                activities = await database.search(source, where)
                if (activities.length == 0 && activity.device?.toLowerCase().includes(source)) {
                    await jaul.io.sleep(settings.axios.retryInterval * 2)
                    activities = await database.search(source, where)
                }
            }

            if (activities.length == 0) {
                logger.debug("FitParser.getMatchingActivity", logHelper.user(user), source, logHelper.activity(activity), "Not found")
                return null
            }

            // Make sure activity is the correct one.
            const minTime = activity.totalTime - 60
            const maxTime = activity.totalTime + 60
            const result = activities.find((a) => a.totalTime >= minTime && a.totalTime <= maxTime)
            if (!result) {
                logger.warn("FitParser.getMatchingActivity", logHelper.user(user), source, logHelper.activity(activity), `Activities: ${activities.map((a) => a.id).join(", ")}`, "Around same start date, but different total time")
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
}

// Exports...
export default FitParser.Instance
