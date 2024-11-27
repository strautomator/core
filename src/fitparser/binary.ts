// Strautomator Core: Garmin FIT Parser - Binary helper
// Largely based on https://github.com/jimmykane/fit-parser

import {FIT, getFitMessage} from "./fit"
import {Buffer} from "buffer"
import logger from "anyhow"

const CompressedTimeMask = 31
const CompressedLocalMesgNumMask = 0x60
const CompressedHeaderMask = 0x80
const GarminTimeOffset = 631065600000

export function addEndian(littleEndian, bytes) {
    let result = 0
    if (!littleEndian) bytes.reverse()
    for (let i = 0; i < bytes.length; i++) {
        result += (bytes[i] << (i << 3)) >>> 0
    }

    return result
}

function readData(blob, fDef, startIndex) {
    if (fDef.endianAbility === true) {
        const temp = []
        for (let i = 0; i < fDef.size; i++) {
            temp.push(blob[startIndex + i])
        }

        let buffer = new Uint8Array(temp).buffer
        let dataView = new DataView(buffer)

        try {
            switch (fDef.type) {
                case "sint16":
                    return dataView.getInt16(0, fDef.littleEndian)
                case "uint16":
                case "uint16z":
                    return dataView.getUint16(0, fDef.littleEndian)
                case "sint32":
                    return dataView.getInt32(0, fDef.littleEndian)
                case "uint32":
                case "uint32z":
                    return dataView.getUint32(0, fDef.littleEndian)
                case "float32":
                    return dataView.getFloat32(0, fDef.littleEndian)
                case "float64":
                    return dataView.getFloat64(0, fDef.littleEndian)
                case "uint32_array":
                    const array32 = []
                    for (let i = 0; i < fDef.size; i += 4) {
                        array32.push(dataView.getUint32(i, fDef.littleEndian))
                    }
                    return array32
                case "uint16_array":
                    const array = []
                    for (let i = 0; i < fDef.size; i += 2) {
                        array.push(dataView.getUint16(i, fDef.littleEndian))
                    }
                    return array
            }
        } catch (ex) {
            logger.error("FitParser.readData", "Failed to read data", fDef.type, startIndex, ex)
        }

        return addEndian(fDef.littleEndian, temp)
    }

    if (fDef.type === "string") {
        const temp = []
        for (let i = 0; i < fDef.size; i++) {
            if (blob[startIndex + i]) {
                temp.push(blob[startIndex + i])
            }
        }
        return Buffer.from(temp).toString("utf-8")
    }

    if (fDef.type === "byte_array") {
        const temp = []
        for (let i = 0; i < fDef.size; i++) {
            temp.push(blob[startIndex + i])
        }
        return temp
    }

    return blob[startIndex]
}

function dataRounder(data, scale, offset) {
    if (data === null) return 0
    const calculated = scale ? data / parseFloat(scale) + (parseFloat(offset) || 0) : data
    return parseFloat(calculated.toFixed(1))
}

function formatByType(data, type, scale, offset) {
    switch (type) {
        case "date_time":
        case "local_date_time":
            return new Date(data * 1000 + GarminTimeOffset)
        case "sint32":
            return Math.round(data * FIT.scConst * 100) / 100
        case "uint8":
        case "sint16":
        case "uint32":
        case "uint16":
            return dataRounder(data, scale, offset)
        case "uint32_array":
        case "uint16_array":
            return data.map((dataItem) => dataRounder(dataItem, scale, offset))
        case "string":
        default:
            if (!FIT.types[type]) {
                return data
            }

            let values = []
            for (let key in FIT.types[type]) {
                if (FIT.types[type].hasOwnProperty(key)) {
                    values.push(FIT.types[type][key])
                }
            }
            if (values.indexOf("mask") === -1) {
                return FIT.types[type][data]
            }
            let dataItem: any = {}
            for (let key in FIT.types[type]) {
                if (FIT.types[type].hasOwnProperty(key)) {
                    if (FIT.types[type][key] === "mask") {
                        dataItem.value = data & (key as any)
                    } else {
                        dataItem[FIT.types[type][key]] = !!((data & (key as any)) >> 7)
                    }
                }
            }
            return dataItem
    }
}

function isInvalidValue(data, type) {
    switch (type) {
        case "enum":
            return data === 0xff
        case "sint8":
            return data === 0x7f
        case "uint8":
            return data === 0xff
        case "sint16":
            return data === 0x7fff
        case "uint16":
            return data === 0xffff
        case "sint32":
            return data === 0x7fffffff
        case "uint32":
            return data === 0xffffffff
        case "string":
            return data === 0x00
        case "float32":
            return data === 0xffffffff
        case "float64":
            return data === 0xffffffffffffffff
        case "uint8z":
            return data === 0x00
        case "uint16z":
            return data === 0x0000
        case "uint32z":
            return data === 0x000000
        case "byte":
            return data === 0xff
        case "sint64":
            return data === 0x7fffffffffffffff
        case "uint64":
            return data === 0xffffffffffffffff
        case "uint64z":
            return data === 0x0000000000000000
        default:
            return false
    }
}

function convertTo(data, unitsList, speedUnit) {
    const unitObj = FIT.options[unitsList][speedUnit]
    return unitObj ? data * unitObj.multiplier + unitObj.offset : data
}

function applyOptions(data, field, options) {
    switch (field) {
        case "speed":
        case "enhanced_speed":
        case "vertical_speed":
        case "avg_speed":
        case "max_speed":
        case "speed_1s":
        case "ball_speed":
        case "enhanced_avg_speed":
        case "enhanced_max_speed":
        case "avg_pos_vertical_speed":
        case "max_pos_vertical_speed":
        case "avg_neg_vertical_speed":
        case "max_neg_vertical_speed":
            return convertTo(data, "speedUnits", options.speedUnit)
        case "distance":
        case "total_distance":
        case "enhanced_avg_altitude":
        case "enhanced_min_altitude":
        case "enhanced_max_altitude":
        case "enhanced_altitude":
        case "height":
        case "odometer":
        case "avg_stroke_distance":
        case "min_altitude":
        case "avg_altitude":
        case "max_altitude":
        case "total_ascent":
        case "total_descent":
        case "altitude":
        case "cycle_length":
        case "auto_wheelsize":
        case "custom_wheelsize":
        case "gps_accuracy":
            return convertTo(data, "lengthUnits", options.lengthUnit)
        case "temperature":
        case "avg_temperature":
        case "max_temperature":
            return convertTo(data, "temperatureUnits", options.temperatureUnit)
        default:
            return data
    }
}

export function readRecord(blob, messageTypes, developerFields, startIndex, options, startDate, pausedTime) {
    const recordHeader = blob[startIndex]

    let monitoring_timestamp = 0
    let timestamp = 0
    let lastTimeOffset = 0
    let localMessageType = recordHeader & 15

    if ((recordHeader & CompressedHeaderMask) === CompressedHeaderMask) {
        let timeoffset = recordHeader & CompressedTimeMask
        timestamp += (timeoffset - lastTimeOffset) & CompressedTimeMask
        lastTimeOffset = timeoffset

        localMessageType = (recordHeader & CompressedLocalMesgNumMask) >> 5
    } else if ((recordHeader & 64) === 64) {
        const hasDeveloperData = (recordHeader & 32) === 32
        const lEnd = blob[startIndex + 2] === 0
        const numberOfFields = blob[startIndex + 5]
        const numberOfDeveloperDataFields = hasDeveloperData ? blob[startIndex + 5 + numberOfFields * 3 + 1] : 0

        const mTypeDef = {
            littleEndian: lEnd,
            globalMessageNumber: addEndian(lEnd, [blob[startIndex + 3], blob[startIndex + 4]]),
            numberOfFields: numberOfFields + numberOfDeveloperDataFields,
            fieldDefs: []
        }

        const message = getFitMessage(mTypeDef.globalMessageNumber)

        for (let i = 0; i < numberOfFields; i++) {
            const fDefIndex = startIndex + 6 + i * 3
            const baseType = blob[fDefIndex + 2]
            const {field, type} = message.getAttributes(blob[fDefIndex])
            const fDef = {
                type,
                fDefNo: blob[fDefIndex],
                size: blob[fDefIndex + 1],
                endianAbility: (baseType & 128) === 128,
                littleEndian: lEnd,
                baseTypeNo: baseType & 15,
                name: field
            }

            mTypeDef.fieldDefs.push(fDef)
        }

        for (let i = 0; i < numberOfDeveloperDataFields; i++) {
            try {
                const fDefIndex = startIndex + 6 + numberOfFields * 3 + 1 + i * 3

                const fieldNum = blob[fDefIndex]
                const size = blob[fDefIndex + 1]
                const devDataIndex = blob[fDefIndex + 2]

                const devDef = developerFields[devDataIndex][fieldNum]

                const baseType = devDef.fit_base_type_id

                const fDef = {
                    type: FIT.types.fit_base_type[baseType],
                    fDefNo: fieldNum,
                    size: size,
                    endianAbility: (baseType & 128) === 128,
                    littleEndian: lEnd,
                    baseTypeNo: baseType & 15,
                    name: devDef.field_name,
                    scale: devDef.scale || 1,
                    offset: devDef.offset || 0,
                    developerDataIndex: devDataIndex,
                    isDeveloperField: true
                }

                mTypeDef.fieldDefs.push(fDef)
            } catch (ex) {
                logger.error("FitParser.readRecord", "Failed to parse developer field", startIndex, ex)
            }
        }

        messageTypes[localMessageType] = mTypeDef

        const nextIndex = startIndex + 6 + mTypeDef.numberOfFields * 3
        const nextIndexWithDeveloperData = nextIndex + 1

        return {
            messageType: "definition",
            nextIndex: hasDeveloperData ? nextIndexWithDeveloperData : nextIndex,
            message: null
        }
    }

    let messageSize = 0
    let readDataFromIndex = startIndex + 1
    const messageType = messageTypes[localMessageType] || messageTypes[0]
    const fields: any = {}
    const message = getFitMessage(messageType.globalMessageNumber)

    for (let i = 0; i < messageType.fieldDefs.length; i++) {
        const fDef = messageType.fieldDefs[i]
        const data = readData(blob, fDef, readDataFromIndex)

        if (!isInvalidValue(data, fDef.type)) {
            if (fDef.isDeveloperField) {
                const field = fDef.name
                const type = fDef.type
                const scale = fDef.scale
                const offset = fDef.offset

                const fieldValue = applyOptions(formatByType(data, type, scale, offset), field, options)
                if (fieldValue !== undefined) {
                    fields[fDef.name] = fieldValue
                }
            } else {
                const {field, type, scale, offset} = message.getAttributes(fDef.fDefNo)

                if (field !== "unknown" && field !== "" && field !== undefined) {
                    const fieldValue = applyOptions(formatByType(data, type, scale, offset), field, options)
                    if (fieldValue !== undefined) {
                        fields[field] = fieldValue
                    }
                }
            }

            if (message.name === "record" && options.elapsedRecordField) {
                fields.elapsed_time = (fields.timestamp - startDate) / 1000
                fields.timer_time = fields.elapsed_time - pausedTime
            }
        }

        readDataFromIndex += fDef.size
        messageSize += fDef.size
    }

    if (message.name === "field_description") {
        developerFields[fields.developer_data_index] = developerFields[fields.developer_data_index] || []
        developerFields[fields.developer_data_index][fields.field_definition_number] = fields
    }

    if (message.name === "monitoring") {
        if (fields.timestamp) {
            monitoring_timestamp = fields.timestamp
            fields.timestamp = new Date(fields.timestamp * 1000 + GarminTimeOffset)
        }
        if (fields.timestamp16 && !fields.timestamp) {
            monitoring_timestamp += (fields.timestamp16 - (monitoring_timestamp & 0xffff)) & 0xffff
            fields.timestamp = new Date(monitoring_timestamp * 1000 + GarminTimeOffset)
        }
    }

    const result = {
        messageType: message.name,
        nextIndex: startIndex + messageSize + 1,
        message: fields
    }

    return result
}

export function getArrayBuffer(buffer) {
    if (buffer instanceof ArrayBuffer) {
        return buffer
    }
    const ab = new ArrayBuffer(buffer.length)
    const view = new Uint8Array(ab)
    for (let i = 0; i < buffer.length; ++i) {
        view[i] = buffer[i]
    }
    return ab
}

export function calculateCRC(blob, start, end) {
    const crcTable = [0x0000, 0xcc01, 0xd801, 0x1400, 0xf001, 0x3c00, 0x2800, 0xe401, 0xa001, 0x6c00, 0x7800, 0xb401, 0x5000, 0x9c01, 0x8801, 0x4400]

    let crc = 0
    for (let i = start; i < end; i++) {
        const byteVal = blob[i]
        let tmp = crcTable[crc & 0xf]
        crc = (crc >> 4) & 0x0fff
        crc = crc ^ tmp ^ crcTable[byteVal & 0xf]
        tmp = crcTable[crc & 0xf]
        crc = (crc >> 4) & 0x0fff
        crc = crc ^ tmp ^ crcTable[(byteVal >> 4) & 0xf]
    }

    return crc
}
