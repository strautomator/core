// Strautomator Core: FIT File Builder

import {FitTrainingMetrics} from "./types"
import {StravaActivity, StravaRawActivityStreams, StravaSport} from "../strava/types"
import {UserData} from "../users/types"
import CrcCalculator from "./sdk/crc-calculator"

// FIT file constants.
const FIT_HEADER_SIZE = 14
const FIT_PROTOCOL_VERSION = 0x20
const FIT_PROFILE_VERSION = 2158
const FIT_DATA_TYPE = ".FIT"

// FIT Base Types.
const FIT_BASE_TYPE = {
    ENUM: 0x00,
    SINT8: 0x01,
    UINT8: 0x02,
    SINT16: 0x83,
    UINT16: 0x84,
    SINT32: 0x85,
    UINT32: 0x86,
    STRING: 0x07,
    FLOAT32: 0x88,
    FLOAT64: 0x89,
    UINT8Z: 0x0a,
    UINT16Z: 0x8b,
    UINT32Z: 0x8c,
    BYTE: 0x0d
}

// FIT Global Message Numbers.
const FIT_MESG_NUM = {
    FILE_ID: 0,
    FILE_CREATOR: 49,
    EVENT: 21,
    DEVICE_INFO: 23,
    WORKOUT: 26,
    SPORT: 12,
    RECORD: 20,
    LAP: 19,
    SESSION: 18,
    ACTIVITY: 34
}

// FIT File Types.
const FIT_FILE_TYPE = {
    ACTIVITY: 4
}

// FIT Event Types
const FIT_EVENT = {
    TIMER: 0,
    SESSION: 8,
    LAP: 9,
    ACTIVITY: 26
}
const FIT_EVENT_TYPE = {
    START: 0,
    STOP: 1,
    STOP_ALL: 4,
    MARKER: 3
}

// FIT Sport Types.
const FIT_SPORT = {
    CYCLING: 2,
    RUNNING: 1,
    SWIMMING: 5,
    WALKING: 11,
    HIKING: 17,
    E_BIKING: 21,
    GENERIC: 0
}
const FIT_SUB_SPORT = {
    GENERIC: 0,
    INDOOR_CYCLING: 6,
    ROAD: 7,
    MOUNTAIN: 8,
    GRAVEL: 65,
    TRAIL: 14,
    VIRTUAL_ACTIVITY: 58
}

// FIT Primary Benefit.
const FIT_PRIMARY_BENEFIT = {
    NONE: 0,
    RECOVERY: 1,
    BASE: 2,
    TEMPO: 3,
    THRESHOLD: 4,
    VO2MAX: 5,
    ANAEROBIC: 6,
    SPRINT: 7
}

// FIT device info.
const FIT_MANUFACTURER = {
    GARMIN: 1,
    TACX: 89
}
const FIT_PRODUCT = {
    GARMIN: 3843,
    TACX: 30045
}
const FIT_SW_VERSION = {
    GARMIN: 2833,
    TACX: 450
}

// Garmin epoch (Dec 31, 1989, 00:00:00 UTC).
const GARMIN_EPOCH = 631065600

// Conversion factors.
const SEMICIRCLE_CONVERSION = Math.pow(2, 31) / 180
const SPEED_SCALE = 1000
const ALTITUDE_SCALE = 5
const ALTITUDE_OFFSET = 500
const DISTANCE_SCALE = 100
const TRAINING_EFFECT_SCALE = 10
const TRAINING_LOAD_SCALE = 65536

/**
 * Calculate training metrics from activity data.
 * @param user The user.
 * @param activity The Strava activity.
 * @param streams The activity streams.
 */
export function calculateTrainingMetrics(user: UserData, activity: StravaActivity, streams: StravaRawActivityStreams): FitTrainingMetrics {
    const metrics: FitTrainingMetrics = {}
    const ftp = user.profile?.ftp || 200

    // Calculate normalized power if we have power data.
    if (streams.watts && streams.watts.length > 0) {
        metrics.normalizedPower = calculateNormalizedPower(streams.watts)

        // Intensity factor (NP / FTP).
        metrics.intensityFactor = metrics.normalizedPower / ftp

        // TSS: (duration in seconds * NP * IF) / (FTP * 3600) * 100.
        const duration = activity.movingTime || activity.totalTime
        metrics.tss = Math.round(((duration * metrics.normalizedPower * metrics.intensityFactor) / (ftp * 3600)) * 100)
    }

    // Calculate training effects based on activity intensity.
    const hrAvg = activity.hrAvg
    const hrMax = activity.hrMax
    const duration = activity.movingTime || activity.totalTime

    // Estimate aerobic training effect based on HR and duration.
    metrics.aerobicTrainingEffect = calculateAerobicTrainingEffect(hrAvg, hrMax, duration)
    metrics.anaerobicTrainingEffect = calculateAnaerobicTrainingEffect(hrAvg, hrMax, duration, streams.watts, user)

    // Calculate training load peak (EPOC estimation).
    metrics.trainingLoadPeak = calculateTrainingLoad(activity, metrics)

    // Determine primary benefit based on intensity distribution.
    metrics.primaryBenefit = determinePrimaryBenefit(activity, metrics)

    return metrics
}

/**
 * Calculate normalized power from power stream using 30-second rolling average.
 * @param watts Power data points.
 */
function calculateNormalizedPower(watts: number[]): number {
    if (!watts || watts.length < 30) {
        return Math.round(watts?.length > 0 ? watts.reduce((a, b) => a + b, 0) / watts.length : 0)
    }

    // Calculate 30-second rolling average.
    const windowSize = 30
    const rollingAvg: number[] = []

    for (let i = windowSize - 1; i < watts.length; i++) {
        let sum = 0
        for (let j = i - windowSize + 1; j <= i; j++) {
            sum += watts[j]
        }
        rollingAvg.push(sum / windowSize)
    }

    // Raise to 4th power, average, then take 4th root.
    const fourthPowers = rollingAvg.map((w) => Math.pow(w, 4))
    const avgFourthPower = fourthPowers.reduce((a, b) => a + b, 0) / fourthPowers.length

    return Math.round(Math.pow(avgFourthPower, 0.25))
}

/**
 * Calculate aerobic training effect based on heart rate and duration. Defaults to 2.0.
 * @param hrAvg Average heart rate.
 * @param hrMax Max heart rate.
 * @param duration Duration in seconds.
 */
function calculateAerobicTrainingEffect(hrAvg: number, hrMax: number, duration: number): number {
    if (!hrAvg || !duration) return 2.0

    // Estimate max HR if not known (220 - age approximation, default to 185).
    const estimatedMaxHR = 185
    const hrPercent = hrAvg / (hrMax || estimatedMaxHR)

    // Effects: Recovery / Base / Tempo / Threshold / VO2Max
    let baseEffect = 1.0
    if (hrPercent < 0.6) {
        baseEffect = 1.0 + (duration / 3600) * 0.5
    } else if (hrPercent < 0.7) {
        baseEffect = 2.0 + (duration / 3600) * 0.8
    } else if (hrPercent < 0.8) {
        baseEffect = 2.5 + (duration / 3600) * 1.0
    } else if (hrPercent < 0.9) {
        baseEffect = 3.0 + (duration / 3600) * 1.2
    } else {
        baseEffect = 3.5 + (duration / 3600) * 1.5
    }

    // Clamp between 1.0 and 5.0.
    return Math.min(5.0, Math.max(1.0, Math.round(baseEffect * 10) / 10))
}

/**
 * Calculate anaerobic training effect based on high-intensity efforts. Defaults to 0.
 * @param hrAvg Average heart rate.
 * @param hrMax Max heart rate.
 * @param duration Duration in seconds.
 * @param watts Power data.
 * @param user The user.
 */
function calculateAnaerobicTrainingEffect(hrAvg: number, hrMax: number, duration: number, watts: number[], user: UserData): number {
    if (!duration) return 0.0

    // Estimate based on high-intensity segments in power data. If no power data is available, use HR.
    let anaerobicScore = 0
    if (watts && watts.length > 0) {
        const ftp = user.profile?.ftp || 200
        const highIntensityCount = watts.filter((w) => w > ftp * 1.05).length
        const highIntensityPercent = highIntensityCount / watts.length

        if (highIntensityPercent > 0.3) {
            anaerobicScore = 3.0 + highIntensityPercent * 2
        } else if (highIntensityPercent > 0.1) {
            anaerobicScore = 1.5 + highIntensityPercent * 5
        } else {
            anaerobicScore = highIntensityPercent * 15
        }
    } else if (hrMax && hrAvg) {
        const hrPercent = hrAvg / hrMax
        if (hrPercent > 0.9) {
            anaerobicScore = 2.0 + duration / 1800
        } else if (hrPercent > 0.85) {
            anaerobicScore = 1.0 + duration / 3600
        }
    }

    return Math.min(5.0, Math.max(0.0, Math.round(anaerobicScore * 10) / 10))
}

/**
 * Calculate training load (EPOC estimation).
 * @param activity The activity.
 * @param metrics The calculated metrics.
 */
function calculateTrainingLoad(activity: StravaActivity, metrics: FitTrainingMetrics): number {
    const aerobicEffect = metrics.aerobicTrainingEffect || 2.0
    const anaerobicEffect = metrics.anaerobicTrainingEffect || 0.0
    const duration = activity.movingTime || activity.totalTime

    // Calculate base load from training effects.
    let load = (aerobicEffect * 15 + anaerobicEffect * 10) * (duration / 3600)

    // Add contribution from intensity if we have TSS.
    if (metrics.tss) {
        load += metrics.tss * 0.5
    }

    return Math.round(load)
}

/**
 * Determine primary training benefit based on activity profile.
 * @param activity The activity.
 * @param metrics The calculated metrics.
 */
function determinePrimaryBenefit(activity: StravaActivity, metrics: FitTrainingMetrics): number {
    const duration = activity.movingTime || activity.totalTime
    const anaerobicEffect = metrics.anaerobicTrainingEffect || 0.0

    // Determine zones based on power or HR.
    let intensityFactor = metrics.intensityFactor || 0.7
    if (!metrics.intensityFactor && activity.hrAvg) {
        const estimatedMaxHR = 185
        intensityFactor = activity.hrAvg / estimatedMaxHR
    }

    // Determine primary benefit based on IF and duration.
    if (intensityFactor < 0.55) {
        return FIT_PRIMARY_BENEFIT.RECOVERY
    } else if (intensityFactor < 0.75) {
        if (duration > 7200) {
            return FIT_PRIMARY_BENEFIT.BASE
        }
        return FIT_PRIMARY_BENEFIT.RECOVERY
    } else if (intensityFactor < 0.85) {
        if (duration > 3600) {
            return FIT_PRIMARY_BENEFIT.BASE
        }
        return FIT_PRIMARY_BENEFIT.TEMPO
    } else if (intensityFactor < 0.95) {
        return FIT_PRIMARY_BENEFIT.THRESHOLD
    } else if (intensityFactor < 1.05) {
        return FIT_PRIMARY_BENEFIT.VO2MAX
    } else if (anaerobicEffect > 2.0) {
        return FIT_PRIMARY_BENEFIT.ANAEROBIC
    } else if (intensityFactor > 1.2 && duration < 300) {
        return FIT_PRIMARY_BENEFIT.SPRINT
    }

    return FIT_PRIMARY_BENEFIT.TEMPO
}

/**
 * Encode the FIT file.
 * @param activity The Strava activity.
 * @param streams The activity streams.
 * @param metrics The training metrics.
 */
export function encodeFitFile(activity: StravaActivity, streams: StravaRawActivityStreams, metrics: FitTrainingMetrics): Buffer {
    const encoder = new FitEncoder()

    // Get activity timestamps.
    const startTime = activity.dateStart ? new Date(activity.dateStart) : new Date()
    const startTimestamp = dateToGarminTimestamp(startTime)
    const endTime = activity.dateEnd || new Date(startTime.getTime() + (activity.totalTime || 0) * 1000)
    const endTimestamp = dateToGarminTimestamp(endTime)

    const {sport, subSport} = mapStravaSportToFit(activity.sportType || activity.type, activity.trainer)
    encoder.writeFileIdMessage(activity, startTimestamp)
    encoder.writeFileCreatorMessage(activity)
    encoder.writeDeviceInfoMessage(activity, startTimestamp)
    encoder.writeSportMessage(activity.name, sport, subSport)
    encoder.writeWorkoutMessage(activity.name, sport)
    encoder.writeEventMessage(startTimestamp, FIT_EVENT.TIMER, FIT_EVENT_TYPE.START)

    // Record messages (data points).
    if (streams.time && streams.time.length > 0) {
        const recordCount = streams.time.length

        for (let i = 0; i < recordCount; i++) {
            const timestamp = startTimestamp + (streams.time[i] || i)

            // Get position if available.
            let lat: number = null
            let lng: number = null
            if (streams.latlng && streams.latlng[i]) {
                lat = streams.latlng[i][0]
                lng = streams.latlng[i][1]
            }

            // Get other metrics.
            const altitude = streams.altitude?.[i]
            const distance = streams.distance?.[i]
            const speed = streams.velocity_smooth?.[i]
            const heartRate = streams.heartrate?.[i]
            const cadence = streams.cadence?.[i]
            const power = streams.watts?.[i]
            const temperature = streams.temp?.[i]

            encoder.writeRecordMessage(timestamp, lat, lng, altitude, distance, speed, heartRate, cadence, power, temperature)
        }
    }

    // Stop event.
    encoder.writeEventMessage(endTimestamp, FIT_EVENT.TIMER, FIT_EVENT_TYPE.STOP_ALL)

    // Lap message.
    encoder.writeLapMessage(startTimestamp, endTimestamp, activity, sport, subSport)

    // Session message.
    encoder.writeSessionMessage(startTimestamp, endTimestamp, activity, metrics, sport, subSport)

    // Activity message (must be last).
    encoder.writeActivityMessage(endTimestamp, activity)

    return encoder.finish()
}

/**
 * Map Strava sport type to FIT sport and sub-sport.
 * @param stravaSport The Strava sport type.
 * @param trainer Whether the activity was done on a trainer.
 */
function mapStravaSportToFit(stravaSport: StravaSport, trainer?: boolean): {sport: number; subSport: number} {
    switch (stravaSport) {
        case StravaSport.Ride:
            if (trainer) {
                return {sport: FIT_SPORT.CYCLING, subSport: FIT_SUB_SPORT.INDOOR_CYCLING}
            }
            return {sport: FIT_SPORT.CYCLING, subSport: FIT_SUB_SPORT.ROAD}
        case StravaSport.GravelRide:
            return {sport: FIT_SPORT.CYCLING, subSport: FIT_SUB_SPORT.GRAVEL}
        case StravaSport.MountainBikeRide:
            return {sport: FIT_SPORT.CYCLING, subSport: FIT_SUB_SPORT.MOUNTAIN}
        case StravaSport.EBikeRide:
        case StravaSport.EMountainBikeRide:
            return {sport: FIT_SPORT.E_BIKING, subSport: FIT_SUB_SPORT.GENERIC}
        case StravaSport.VirtualRide:
            return {sport: FIT_SPORT.CYCLING, subSport: FIT_SUB_SPORT.VIRTUAL_ACTIVITY}
        case StravaSport.Run:
            return {sport: FIT_SPORT.RUNNING, subSport: FIT_SUB_SPORT.GENERIC}
        case StravaSport.TrailRun:
            return {sport: FIT_SPORT.RUNNING, subSport: FIT_SUB_SPORT.TRAIL}
        case StravaSport.VirtualRun:
            return {sport: FIT_SPORT.RUNNING, subSport: FIT_SUB_SPORT.VIRTUAL_ACTIVITY}
        case StravaSport.Walk:
            return {sport: FIT_SPORT.WALKING, subSport: FIT_SUB_SPORT.GENERIC}
        case StravaSport.Hike:
            return {sport: FIT_SPORT.HIKING, subSport: FIT_SUB_SPORT.GENERIC}
        case StravaSport.Swim:
            return {sport: FIT_SPORT.SWIMMING, subSport: FIT_SUB_SPORT.GENERIC}
        default:
            return {sport: FIT_SPORT.GENERIC, subSport: FIT_SUB_SPORT.GENERIC}
    }
}

/**
 * Convert a JavaScript Date to Garmin timestamp (seconds since Dec 31, 1989).
 * @param date The date to convert.
 */
function dateToGarminTimestamp(date: Date): number {
    return Math.floor(date.getTime() / 1000) - GARMIN_EPOCH
}

/**
 * Convert latitude/longitude to semicircles.
 * @param degrees The degrees value.
 */
function degreesToSemicircles(degrees: number): number {
    return Math.round(degrees * SEMICIRCLE_CONVERSION)
}

/**
 * FIT file encoder class.
 */
class FitEncoder {
    private buffer: number[] = []
    private definitionCache: Map<string, number> = new Map()
    private fieldDefinitions: Map<number, {fieldNum: number; size: number; baseType: number}[]> = new Map()
    private nextLocalMessageType: number = 0

    /**
     * Write file ID message.
     */
    writeFileIdMessage(activity: StravaActivity, timestamp: number): void {
        const localMesgType = this.defineMessage(FIT_MESG_NUM.FILE_ID, [
            {fieldNum: 0, size: 1, baseType: FIT_BASE_TYPE.ENUM}, // type
            {fieldNum: 1, size: 2, baseType: FIT_BASE_TYPE.UINT16}, // manufacturer
            {fieldNum: 2, size: 2, baseType: FIT_BASE_TYPE.UINT16}, // product
            {fieldNum: 3, size: 4, baseType: FIT_BASE_TYPE.UINT32Z}, // serial_number
            {fieldNum: 4, size: 4, baseType: FIT_BASE_TYPE.UINT32} // time_created
        ])

        const manufacturer = activity.trainer ? FIT_MANUFACTURER.TACX : FIT_MANUFACTURER.GARMIN
        const serial = Math.floor(Math.random() * 0xffffffff)

        this.writeDataMessage(localMesgType, [FIT_FILE_TYPE.ACTIVITY, manufacturer, 0, serial, timestamp])
    }

    /**
     * Write file creator message.
     */
    writeFileCreatorMessage(activity: StravaActivity): void {
        const localMesgType = this.defineMessage(FIT_MESG_NUM.FILE_CREATOR, [
            {fieldNum: 0, size: 2, baseType: FIT_BASE_TYPE.UINT16}, // software_version
            {fieldNum: 1, size: 1, baseType: FIT_BASE_TYPE.UINT8} // hardware_version
        ])

        const version = activity.trainer ? FIT_SW_VERSION.TACX : FIT_SW_VERSION.GARMIN

        this.writeDataMessage(localMesgType, [version, 1])
    }

    /**
     * Write device info message.
     */
    writeDeviceInfoMessage(activity: StravaActivity, timestamp: number): void {
        const localMesgType = this.defineMessage(FIT_MESG_NUM.DEVICE_INFO, [
            {fieldNum: 253, size: 4, baseType: FIT_BASE_TYPE.UINT32}, // timestamp
            {fieldNum: 0, size: 1, baseType: FIT_BASE_TYPE.UINT8}, // device_index
            {fieldNum: 1, size: 1, baseType: FIT_BASE_TYPE.UINT8}, // device_type
            {fieldNum: 2, size: 2, baseType: FIT_BASE_TYPE.UINT16}, // manufacturer
            {fieldNum: 4, size: 2, baseType: FIT_BASE_TYPE.UINT16}, // product
            {fieldNum: 5, size: 2, baseType: FIT_BASE_TYPE.UINT16} // software_version
        ])

        const manufacturer = activity.trainer ? FIT_MANUFACTURER.TACX : FIT_MANUFACTURER.GARMIN
        const version = activity.trainer ? FIT_SW_VERSION.TACX : FIT_SW_VERSION.GARMIN
        const productId = activity.trainer ? FIT_PRODUCT.TACX : FIT_PRODUCT.GARMIN

        this.writeDataMessage(localMesgType, [timestamp, 0, 0, manufacturer, productId, version])
    }

    /**
     * Write sport message with activity name (truncated to FIT limits).
     */
    writeSportMessage(name: string, sport: number, subSport: number): void {
        const maxNameLength = 24
        const truncatedName = name ? name.substring(0, maxNameLength - 1) : "Strava activity"
        const nameBytes = Buffer.from(truncatedName + "\0", "utf8")
        const nameLength = Math.min(nameBytes.length, maxNameLength)

        const localMesgType = this.defineMessage(FIT_MESG_NUM.SPORT, [
            {fieldNum: 0, size: 1, baseType: FIT_BASE_TYPE.ENUM}, // sport
            {fieldNum: 1, size: 1, baseType: FIT_BASE_TYPE.ENUM}, // sub_sport
            {fieldNum: 3, size: nameLength, baseType: FIT_BASE_TYPE.STRING} // name
        ])

        this.writeDataMessageWithString(localMesgType, [sport, subSport], nameBytes.subarray(0, nameLength))
    }

    /**
     * Write workout message with activity name as wkt_name field.
     */
    writeWorkoutMessage(name: string, sport: number): void {
        const maxNameLength = 64
        const truncatedName = name ? name.substring(0, maxNameLength - 1) : "Strava activity"
        const nameBytes = Buffer.from(truncatedName + "\0", "utf8")
        const nameLength = Math.min(nameBytes.length, maxNameLength)

        const localMesgType = this.defineMessage(FIT_MESG_NUM.WORKOUT, [
            {fieldNum: 4, size: 1, baseType: FIT_BASE_TYPE.ENUM}, // sport
            {fieldNum: 8, size: nameLength, baseType: FIT_BASE_TYPE.STRING} // wkt_name
        ])

        this.writeDataMessageWithString(localMesgType, [sport], nameBytes.subarray(0, nameLength))
    }

    /**
     * Write event message.
     */
    writeEventMessage(timestamp: number, event: number, eventType: number): void {
        const localMesgType = this.defineMessage(FIT_MESG_NUM.EVENT, [
            {fieldNum: 253, size: 4, baseType: FIT_BASE_TYPE.UINT32}, // timestamp
            {fieldNum: 0, size: 1, baseType: FIT_BASE_TYPE.ENUM}, // event
            {fieldNum: 1, size: 1, baseType: FIT_BASE_TYPE.ENUM}, // event_type
            {fieldNum: 3, size: 4, baseType: FIT_BASE_TYPE.UINT32} // data
        ])

        this.writeDataMessage(localMesgType, [timestamp, event, eventType, 0])
    }

    /**
     * Write record message (data point).
     */
    writeRecordMessage(
        timestamp: number,
        lat: number | null,
        lng: number | null,
        altitude: number | undefined,
        distance: number | undefined,
        speed: number | undefined,
        heartRate: number | undefined,
        cadence: number | undefined,
        power: number | undefined,
        temperature: number | undefined
    ): void {
        const fields: {fieldNum: number; size: number; baseType: number}[] = [
            {fieldNum: 253, size: 4, baseType: FIT_BASE_TYPE.UINT32} // timestamp
        ]
        const values: number[] = [timestamp]

        // Add position fields if available.
        if (lat !== null && lng !== null) {
            fields.push({fieldNum: 0, size: 4, baseType: FIT_BASE_TYPE.SINT32}) // position_lat
            fields.push({fieldNum: 1, size: 4, baseType: FIT_BASE_TYPE.SINT32}) // position_long
            values.push(degreesToSemicircles(lat))
            values.push(degreesToSemicircles(lng))
        }

        // Add altitude (enhanced_altitude for better precision)
        if (altitude !== undefined) {
            fields.push({fieldNum: 78, size: 4, baseType: FIT_BASE_TYPE.UINT32}) // enhanced_altitude
            values.push(Math.round((altitude + ALTITUDE_OFFSET) * ALTITUDE_SCALE))
        }

        // Add distance
        if (distance !== undefined) {
            fields.push({fieldNum: 5, size: 4, baseType: FIT_BASE_TYPE.UINT32}) // distance
            values.push(Math.round(distance * DISTANCE_SCALE))
        }

        // Add speed (enhanced_speed for better precision).
        if (speed !== undefined) {
            fields.push({fieldNum: 73, size: 4, baseType: FIT_BASE_TYPE.UINT32}) // enhanced_speed
            values.push(Math.round(speed * SPEED_SCALE))
        }

        // Add heart rate.
        if (heartRate !== undefined) {
            fields.push({fieldNum: 3, size: 1, baseType: FIT_BASE_TYPE.UINT8}) // heart_rate
            values.push(Math.round(heartRate))
        }

        // Add cadence.
        if (cadence !== undefined) {
            fields.push({fieldNum: 4, size: 1, baseType: FIT_BASE_TYPE.UINT8}) // cadence
            values.push(Math.round(cadence))
        }

        // Add power.
        if (power !== undefined) {
            fields.push({fieldNum: 7, size: 2, baseType: FIT_BASE_TYPE.UINT16}) // power
            values.push(Math.round(power))
        }

        // Add temperature.
        if (temperature !== undefined) {
            fields.push({fieldNum: 13, size: 1, baseType: FIT_BASE_TYPE.SINT8}) // temperature
            values.push(Math.round(temperature))
        }

        const localMesgType = this.defineMessage(FIT_MESG_NUM.RECORD, fields)
        this.writeDataMessage(localMesgType, values)
    }

    /**
     * Write lap message.
     */
    writeLapMessage(startTimestamp: number, endTimestamp: number, activity: StravaActivity, sport: number, subSport: number): void {
        const elapsedTime = (activity.totalTime || 0) * 1000
        const timerTime = (activity.movingTime || activity.totalTime || 0) * 1000
        const distance = (activity.distanceMeters || (activity.distance || 0) * 1000) * DISTANCE_SCALE
        const avgSpeed = activity.speedAvg ? (activity.speedAvg / 3.6) * SPEED_SCALE : 0
        const maxSpeed = activity.speedMax ? (activity.speedMax / 3.6) * SPEED_SCALE : 0

        const localMesgType = this.defineMessage(FIT_MESG_NUM.LAP, [
            {fieldNum: 254, size: 2, baseType: FIT_BASE_TYPE.UINT16}, // message_index
            {fieldNum: 253, size: 4, baseType: FIT_BASE_TYPE.UINT32}, // timestamp
            {fieldNum: 0, size: 1, baseType: FIT_BASE_TYPE.ENUM}, // event
            {fieldNum: 1, size: 1, baseType: FIT_BASE_TYPE.ENUM}, // event_type
            {fieldNum: 2, size: 4, baseType: FIT_BASE_TYPE.UINT32}, // start_time
            {fieldNum: 7, size: 4, baseType: FIT_BASE_TYPE.UINT32}, // total_elapsed_time
            {fieldNum: 8, size: 4, baseType: FIT_BASE_TYPE.UINT32}, // total_timer_time
            {fieldNum: 9, size: 4, baseType: FIT_BASE_TYPE.UINT32}, // total_distance
            {fieldNum: 110, size: 4, baseType: FIT_BASE_TYPE.UINT32}, // enhanced_avg_speed
            {fieldNum: 111, size: 4, baseType: FIT_BASE_TYPE.UINT32}, // enhanced_max_speed
            {fieldNum: 11, size: 2, baseType: FIT_BASE_TYPE.UINT16}, // total_calories
            {fieldNum: 15, size: 1, baseType: FIT_BASE_TYPE.UINT8}, // avg_heart_rate
            {fieldNum: 16, size: 1, baseType: FIT_BASE_TYPE.UINT8}, // max_heart_rate
            {fieldNum: 17, size: 1, baseType: FIT_BASE_TYPE.UINT8}, // avg_cadence
            {fieldNum: 19, size: 2, baseType: FIT_BASE_TYPE.UINT16}, // avg_power
            {fieldNum: 20, size: 2, baseType: FIT_BASE_TYPE.UINT16}, // max_power
            {fieldNum: 21, size: 2, baseType: FIT_BASE_TYPE.UINT16}, // total_ascent
            {fieldNum: 22, size: 2, baseType: FIT_BASE_TYPE.UINT16}, // total_descent
            {fieldNum: 23, size: 1, baseType: FIT_BASE_TYPE.ENUM}, // sport
            {fieldNum: 24, size: 1, baseType: FIT_BASE_TYPE.ENUM} // sub_sport
        ])

        this.writeDataMessage(localMesgType, [
            0,
            endTimestamp,
            FIT_EVENT.LAP,
            FIT_EVENT_TYPE.STOP,
            startTimestamp,
            elapsedTime,
            timerTime,
            Math.round(distance),
            Math.round(avgSpeed),
            Math.round(maxSpeed),
            activity.calories || 0,
            activity.hrAvg || 0,
            activity.hrMax || 0,
            activity.cadenceAvg || 0,
            activity.wattsAvg || 0,
            activity.wattsMax || 0,
            activity.elevationGain || 0,
            0,
            sport,
            subSport
        ])
    }

    /**
     * Write session message with training metrics.
     */
    writeSessionMessage(startTimestamp: number, endTimestamp: number, activity: StravaActivity, metrics: FitTrainingMetrics, sport: number, subSport: number): void {
        const elapsedTime = (activity.totalTime || 0) * 1000
        const timerTime = (activity.movingTime || activity.totalTime || 0) * 1000
        const distance = (activity.distanceMeters || (activity.distance || 0) * 1000) * DISTANCE_SCALE
        const avgSpeed = activity.speedAvg ? (activity.speedAvg / 3.6) * SPEED_SCALE : 0
        const maxSpeed = activity.speedMax ? (activity.speedMax / 3.6) * SPEED_SCALE : 0

        // Get start position if available.
        const startLat = activity.locationStart ? degreesToSemicircles(activity.locationStart[0]) : 0
        const startLng = activity.locationStart ? degreesToSemicircles(activity.locationStart[1]) : 0

        const localMesgType = this.defineMessage(FIT_MESG_NUM.SESSION, [
            {fieldNum: 254, size: 2, baseType: FIT_BASE_TYPE.UINT16}, // message_index
            {fieldNum: 253, size: 4, baseType: FIT_BASE_TYPE.UINT32}, // timestamp
            {fieldNum: 0, size: 1, baseType: FIT_BASE_TYPE.ENUM}, // event
            {fieldNum: 1, size: 1, baseType: FIT_BASE_TYPE.ENUM}, // event_type
            {fieldNum: 2, size: 4, baseType: FIT_BASE_TYPE.UINT32}, // start_time
            {fieldNum: 3, size: 4, baseType: FIT_BASE_TYPE.SINT32}, // start_position_lat
            {fieldNum: 4, size: 4, baseType: FIT_BASE_TYPE.SINT32}, // start_position_long
            {fieldNum: 5, size: 1, baseType: FIT_BASE_TYPE.ENUM}, // sport
            {fieldNum: 6, size: 1, baseType: FIT_BASE_TYPE.ENUM}, // sub_sport
            {fieldNum: 7, size: 4, baseType: FIT_BASE_TYPE.UINT32}, // total_elapsed_time
            {fieldNum: 8, size: 4, baseType: FIT_BASE_TYPE.UINT32}, // total_timer_time
            {fieldNum: 9, size: 4, baseType: FIT_BASE_TYPE.UINT32}, // total_distance
            {fieldNum: 124, size: 4, baseType: FIT_BASE_TYPE.UINT32}, // enhanced_avg_speed
            {fieldNum: 125, size: 4, baseType: FIT_BASE_TYPE.UINT32}, // enhanced_max_speed
            {fieldNum: 11, size: 2, baseType: FIT_BASE_TYPE.UINT16}, // total_calories
            {fieldNum: 16, size: 1, baseType: FIT_BASE_TYPE.UINT8}, // avg_heart_rate
            {fieldNum: 17, size: 1, baseType: FIT_BASE_TYPE.UINT8}, // max_heart_rate
            {fieldNum: 18, size: 1, baseType: FIT_BASE_TYPE.UINT8}, // avg_cadence
            {fieldNum: 20, size: 2, baseType: FIT_BASE_TYPE.UINT16}, // avg_power
            {fieldNum: 21, size: 2, baseType: FIT_BASE_TYPE.UINT16}, // max_power
            {fieldNum: 22, size: 2, baseType: FIT_BASE_TYPE.UINT16}, // total_ascent
            {fieldNum: 23, size: 2, baseType: FIT_BASE_TYPE.UINT16}, // total_descent
            {fieldNum: 26, size: 2, baseType: FIT_BASE_TYPE.UINT16}, // num_laps
            {fieldNum: 34, size: 2, baseType: FIT_BASE_TYPE.UINT16}, // normalized_power
            {fieldNum: 35, size: 2, baseType: FIT_BASE_TYPE.UINT16}, // training_stress_score
            {fieldNum: 36, size: 2, baseType: FIT_BASE_TYPE.UINT16}, // intensity_factor
            {fieldNum: 24, size: 1, baseType: FIT_BASE_TYPE.UINT8}, // total_training_effect (aerobic)
            {fieldNum: 137, size: 1, baseType: FIT_BASE_TYPE.UINT8}, // total_anaerobic_training_effect
            {fieldNum: 168, size: 4, baseType: FIT_BASE_TYPE.SINT32}, // training_load_peak
            {fieldNum: 188, size: 1, baseType: FIT_BASE_TYPE.UINT8} // primary_benefit
        ])

        this.writeDataMessage(localMesgType, [
            0,
            endTimestamp,
            FIT_EVENT.SESSION,
            FIT_EVENT_TYPE.STOP,
            startTimestamp,
            startLat,
            startLng,
            sport,
            subSport,
            elapsedTime,
            timerTime,
            Math.round(distance),
            Math.round(avgSpeed),
            Math.round(maxSpeed),
            activity.calories || 0,
            activity.hrAvg || 0,
            activity.hrMax || 0,
            activity.cadenceAvg || 0,
            activity.wattsAvg || 0,
            activity.wattsMax || 0,
            activity.elevationGain || 0,
            0,
            1,
            metrics.normalizedPower || 0,
            Math.round((metrics.tss || 0) * 10),
            Math.round((metrics.intensityFactor || 0) * 1000),
            Math.round((metrics.aerobicTrainingEffect || 0) * TRAINING_EFFECT_SCALE),
            Math.round((metrics.anaerobicTrainingEffect || 0) * TRAINING_EFFECT_SCALE),
            Math.round((metrics.trainingLoadPeak || 0) * TRAINING_LOAD_SCALE),
            metrics.primaryBenefit || 0
        ])
    }

    /**
     * Write activity message (must be last data message).
     */
    writeActivityMessage(endTimestamp: number, activity: StravaActivity): void {
        const timerTime = (activity.movingTime || activity.totalTime || 0) * 1000
        const numSessions = 1

        const localMesgType = this.defineMessage(FIT_MESG_NUM.ACTIVITY, [
            {fieldNum: 253, size: 4, baseType: FIT_BASE_TYPE.UINT32}, // timestamp
            {fieldNum: 0, size: 4, baseType: FIT_BASE_TYPE.UINT32}, // total_timer_time
            {fieldNum: 1, size: 2, baseType: FIT_BASE_TYPE.UINT16}, // num_sessions
            {fieldNum: 2, size: 1, baseType: FIT_BASE_TYPE.ENUM}, // type
            {fieldNum: 3, size: 1, baseType: FIT_BASE_TYPE.ENUM}, // event
            {fieldNum: 4, size: 1, baseType: FIT_BASE_TYPE.ENUM}, // event_type
            {fieldNum: 5, size: 4, baseType: FIT_BASE_TYPE.UINT32} // local_timestamp
        ])

        this.writeDataMessage(localMesgType, [endTimestamp, timerTime, numSessions, 0, FIT_EVENT.ACTIVITY, FIT_EVENT_TYPE.STOP, endTimestamp])
    }

    /**
     * Define a message type and return the local message type number.
     */
    private defineMessage(globalMesgNum: number, fields: {fieldNum: number; size: number; baseType: number}[]): number {
        // Create a unique key for this definition.
        const defKey = `${globalMesgNum}:${fields.map((f) => `${f.fieldNum}:${f.size}:${f.baseType}`).join(",")}`

        // Check if we already have this exact definition.
        const existingLocalType = this.definitionCache.get(defKey)
        if (existingLocalType !== undefined) {
            return existingLocalType
        }

        // Assign a new local message type (0-15).
        const localMesgType = this.nextLocalMessageType++ % 16

        // Store the definition.
        this.definitionCache.set(defKey, localMesgType)
        this.fieldDefinitions.set(localMesgType, fields)

        // Write definition header (bit 6 set = definition message).
        const recordHeader = 0x40 | localMesgType
        this.buffer.push(recordHeader)

        // Reserved byte.
        this.buffer.push(0)

        // Architecture (0 = little endian).
        this.buffer.push(0)

        // Global message number (2 bytes, little endian).
        this.writeUInt16(globalMesgNum)

        // Number of fields.
        this.buffer.push(fields.length)

        // Field definitions.
        for (const field of fields) {
            this.buffer.push(field.fieldNum)
            this.buffer.push(field.size)
            this.buffer.push(field.baseType)
        }

        return localMesgType
    }

    /**
     * Write a data message.
     */
    private writeDataMessage(localMesgType: number, values: number[]): void {
        // Data message header (no bit 6 set).
        const recordHeader = localMesgType & 0x0f
        this.buffer.push(recordHeader)

        // Get field definitions.
        const fields = this.fieldDefinitions.get(localMesgType)
        if (!fields) {
            throw new Error(`No definition found for local message type ${localMesgType}`)
        }

        // Write values.
        for (let i = 0; i < values.length; i++) {
            const value = values[i]
            const fieldDef = fields[i]

            if (!fieldDef) continue

            switch (fieldDef.baseType) {
                case FIT_BASE_TYPE.ENUM:
                case FIT_BASE_TYPE.UINT8:
                case FIT_BASE_TYPE.UINT8Z:
                    this.buffer.push(value & 0xff)
                    break
                case FIT_BASE_TYPE.SINT8:
                    this.buffer.push(value < 0 ? (value + 256) & 0xff : value & 0xff)
                    break
                case FIT_BASE_TYPE.UINT16:
                case FIT_BASE_TYPE.UINT16Z:
                    this.writeUInt16(value)
                    break
                case FIT_BASE_TYPE.SINT16:
                    this.writeInt16(value)
                    break
                case FIT_BASE_TYPE.UINT32:
                case FIT_BASE_TYPE.UINT32Z:
                    this.writeUInt32(value)
                    break
                case FIT_BASE_TYPE.SINT32:
                    this.writeInt32(value)
                    break
                default:
                    for (let b = 0; b < fieldDef.size; b++) {
                        this.buffer.push((value >> (b * 8)) & 0xff)
                    }
            }
        }
    }

    /**
     * Write a data message with a string field at the end.
     */
    private writeDataMessageWithString(localMesgType: number, values: number[], stringBytes: Buffer): void {
        // Data message header (no bit 6 set).
        const recordHeader = localMesgType & 0x0f
        this.buffer.push(recordHeader)

        // Get field definitions.
        const fields = this.fieldDefinitions.get(localMesgType)
        if (!fields) {
            throw new Error(`No definition found for local message type ${localMesgType}`)
        }

        // Write numeric values.
        for (let i = 0; i < values.length; i++) {
            const value = values[i]
            const fieldDef = fields[i]

            if (!fieldDef) continue

            switch (fieldDef.baseType) {
                case FIT_BASE_TYPE.ENUM:
                case FIT_BASE_TYPE.UINT8:
                case FIT_BASE_TYPE.UINT8Z:
                    this.buffer.push(value & 0xff)
                    break
                case FIT_BASE_TYPE.SINT8:
                    this.buffer.push(value < 0 ? (value + 256) & 0xff : value & 0xff)
                    break
                case FIT_BASE_TYPE.UINT16:
                case FIT_BASE_TYPE.UINT16Z:
                    this.writeUInt16(value)
                    break
                case FIT_BASE_TYPE.SINT16:
                    this.writeInt16(value)
                    break
                case FIT_BASE_TYPE.UINT32:
                case FIT_BASE_TYPE.UINT32Z:
                    this.writeUInt32(value)
                    break
                case FIT_BASE_TYPE.SINT32:
                    this.writeInt32(value)
                    break
                default:
                    for (let b = 0; b < fieldDef.size; b++) {
                        this.buffer.push((value >> (b * 8)) & 0xff)
                    }
            }
        }

        // Write string bytes.
        for (let i = 0; i < stringBytes.length; i++) {
            this.buffer.push(stringBytes[i])
        }
    }

    /**
     * Write unsigned 16-bit integer (little endian).
     */
    private writeUInt16(value: number): void {
        this.buffer.push(value & 0xff)
        this.buffer.push((value >> 8) & 0xff)
    }

    /**
     * Write signed 16-bit integer (little endian).
     */
    private writeInt16(value: number): void {
        if (value < 0) value = 0x10000 + value
        this.writeUInt16(value)
    }

    /**
     * Write unsigned 32-bit integer (little endian).
     */
    private writeUInt32(value: number): void {
        this.buffer.push(value & 0xff)
        this.buffer.push((value >> 8) & 0xff)
        this.buffer.push((value >> 16) & 0xff)
        this.buffer.push((value >> 24) & 0xff)
    }

    /**
     * Write signed 32-bit integer (little endian).
     */
    private writeInt32(value: number): void {
        if (value < 0) value = 0x100000000 + value
        this.writeUInt32(value)
    }

    /**
     * Finish encoding and return the complete FIT file.
     */
    finish(): Buffer {
        const dataSize = this.buffer.length
        const header = Buffer.alloc(FIT_HEADER_SIZE)
        header.writeUInt8(FIT_HEADER_SIZE, 0)
        header.writeUInt8(FIT_PROTOCOL_VERSION, 1)
        header.writeUInt16LE(FIT_PROFILE_VERSION, 2)
        header.writeUInt32LE(dataSize, 4)
        header.write(FIT_DATA_TYPE, 8, 4, "ascii")

        // Calculate header CRC.
        const headerCRC = CrcCalculator.calculateCRC(header, 0, 12)
        header.writeUInt16LE(headerCRC, 12)

        // Combine header and data.
        const data = Buffer.from(this.buffer)
        const combined = Buffer.concat([header, data])

        // Calculate file CRC.
        const fileCRC = CrcCalculator.calculateCRC(combined, 0, combined.length)
        const crcBuffer = Buffer.alloc(2)
        crcBuffer.writeUInt16LE(fileCRC, 0)

        // Return complete file.
        return Buffer.concat([combined, crcBuffer])
    }
}
