// Strautomator Core: FIT types

/**
 * Activity details extracted directly from a FIT file (from Garmin or Wahoo).
 */
export interface FitFileActivity {
    /** Activity ID. */
    id: string | number
    /** Profile ID (user ID from Garmin or Wahoo). */
    profileId: string | number
    /** User ID (from Strava, not from the FIT file). */
    userId: string
    /** Activity name. */
    name: string
    /** Activity duration in seconds. */
    totalTime?: number
    /** Activity distance in KM. */
    distance?: number
    /** Activity primary benefit.*/
    primaryBenefit?: string
    /** Training stress score. */
    tss?: number
    /** Training load. */
    trainingLoad?: number
    /** Intensity factor. */
    intensityFactor?: number
    /** Aerobic training effect. */
    aerobicTrainingEffect?: number
    /** Anaerobic training effect. */
    anaerobicTrainingEffect?: number
    /** Pedal L/R avg. torque effectiveness (0-100). */
    pedalTorqueEffect?: number
    /** Pedal L/R avg. smoothness (0-100). */
    pedalSmoothness?: number
    /** Pedal L/R balance. */
    pedalBalance?: string
    /** The Sport profile used in the device. */
    sportProfile?: string
    /** The workout name. */
    workoutName?: string
    /** Devices used in the activity. */
    devices?: string[]
    /** Devices battery status. */
    deviceBattery?: DeviceBattery[]
    /** Activity UTC start date. */
    dateStart?: Date
    /** Date when it should expire (used for the Firestore TTL). */
    dateExpiry?: Date
}

/**
 * Device battery status.
 */
export interface DeviceBattery {
    /** The device ID. */
    id: string
    /** Battery status. */
    status: "new" | "good" | "ok" | "low" | "critical"
}
