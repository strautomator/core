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
    /** The workout notes. */
    workoutNotes?: string
    /** Devices used in the activity. */
    devices?: string[]
    /** Devices battery status. */
    deviceBattery?: FitDeviceBattery[]
    /** Split summaries. */
    splits?: FitSplitSummary[]
    /** Activity UTC start date. */
    dateStart?: Date
    /** Date when it should expire (used for the Firestore TTL). */
    dateExpiry?: Date
}

/**
 * Device battery status.
 */
export interface FitDeviceBattery {
    /** The device ID. */
    id: string
    /** Battery status. */
    status: "new" | "good" | "ok" | "low" | "critical"
}

/**
 * Custom device names given by the user.
 */
export interface FitDeviceNames {
    [deviceId: string]: string
}

/**
 * Workout split summary.
 */
export interface FitSplitSummary {
    /** Split type. */
    splitType?: string
    /** Total elapsed time. */
    totalTime?: number
    /** Average speed. */
    speedAvg?: number
    /** Total distance. */
    distance?: number
    /** Total ascent. */
    ascent?: number
    /** Total descent. */
    descent?: number
    /** Total calories. */
    calories?: number
}

/**
 * Training metrics calculated from the activity.
 */
export interface FitTrainingMetrics {
    /** Training stress score. */
    tss?: number
    /** Intensity factor. */
    intensityFactor?: number
    /** Normalized power. */
    normalizedPower?: number
    /** Aerobic training effect (1.0-5.0). */
    aerobicTrainingEffect?: number
    /** Anaerobic training effect (1.0-5.0). */
    anaerobicTrainingEffect?: number
    /** Training load peak. */
    trainingLoadPeak?: number
    /** Primary training benefit (0-7). */
    primaryBenefit?: number
}
