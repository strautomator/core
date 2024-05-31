// Strautomator Core: Garmin FIT Parser
// Largely based on https://github.com/jimmykane/fit-parser

import {getArrayBuffer, calculateCRC, readRecord} from "./binary"
import {FIT} from "./fit"
import logger from "anyhow"

export default class FitParser {
    constructor(options = {} as any) {
        this.options = {
            speedUnit: options.speedUnit || "m/s",
            lengthUnit: options.lengthUnit || "m",
            temperatureUnit: options.temperatureUnit || "celsius",
            elapsedRecordField: options.elapsedRecordField || false
        }
    }

    options: any

    async parse(content) {
        const blob = new Uint8Array(getArrayBuffer(content))

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
                logger.warn("Garmin.fitParser", "Header CRC mismatch", crcHeader, crcHeaderCalc)
            }
        }

        const protocolVersion = blob[1]
        const profileVersion = blob[2] + (blob[3] << 8)
        const dataLength = blob[4] + (blob[5] << 8) + (blob[6] << 16) + (blob[7] << 24)
        const crcStart = dataLength + headerLength
        const crcFile = blob[crcStart] + (blob[crcStart + 1] << 8)
        const crcFileCalc = calculateCRC(blob, headerLength === 12 ? 0 : headerLength, crcStart)

        if (crcFile !== crcFileCalc) {
            logger.warn("Garmin.fitParser", "File CRC mismatch", crcFile, crcFileCalc)
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
            const {nextIndex, messageType, message} = readRecord(blob, messageTypes, developerFields, loopIndex, this.options, startDate, pausedTime)
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

        return fitObj
    }
}
