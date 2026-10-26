// Strautomator Web: Strava helpers

const recordIcons: Record<string, string> = {
    distance: "mdi-map-marker-distance",
    movingTime: "mdi-clock-outline",
    elevationGain: "mdi-slope-uphill",
    speedMax: "mdi-speedometer",
    speedAvg: "mdi-speedometer-medium",
    hrMax: "mdi-heart-plus",
    hrAvg: "mdi-heart",
    wattsMax: "mdi-lightning-bolt",
    wattsAvg: "mdi-lightning-bolt-outline",
    calories: "mdi-nutrition"
}

/**
 * Strava status, sport and record helpers.
 */
export const useStrava = () => {
    const store = useMainStore()
    const stravaStatus = ref<string>(null)

    /**
     * Get the current Strava API status (incident description, if any).
     */
    const getStravaStatus = async (): Promise<void> => {
        try {
            const data: any = await $fetch("/api/strava/status")
            stravaStatus.value = data?.incident || null
        } catch (ex) {
            console.error("Could not get API status from Strava", ex)
        }
    }

    /**
     * Returns the material icon for the specified sport type.
     * @param sportType The sport type.
     */
    const getSportIcon = (sportType: string): string => {
        if (!sportType) return "mdi-incognito"
        if (sportType == "Ride") return "mdi-bike"
        if (sportType == "GravelRide" || sportType == "MountainBikeRide") return "mdi-bicycle"
        if (sportType == "EBikeRide" || sportType == "EMountainBikeRide") return "mdi-bicycle-electric"
        if (sportType == "VirtualRide") return "mdi-bike-fast"
        if (sportType == "Run" || sportType == "TrailRun") return "mdi-run"
        if (sportType == "VirtualRun") return "mdi-run-fast"
        if (sportType == "Walk") return "mdi-walk"
        if (sportType == "Golf") return "mdi-golf"
        if (sportType == "Skateboard") return "mdi-skateboard"
        if (sportType == "Snowboard") return "mdi-snowboard"
        if (sportType == "Swim") return "mdi-swim"
        if (sportType == "Yoga" || sportType == "Pilates") return "mdi-yoga"
        if (sportType == "Sail") return "mdi-sail-boat"
        if (sportType == "IceSkate") return "mdi-skate"
        if (sportType == "Hike") return "mdi-hiking"
        if (sportType == "Tennis") return "mdi-tennis"
        if (sportType == "Racquetball" || sportType == "Squash") return "mdi-racquetball"
        if (sportType == "Badminton") return "mdi-badminton"
        if (sportType == "Rowing" || sportType == "VirtualRow") return "mdi-rowing"
        if (sportType == "CrossFit" || sportType == "WeightTraining") return "mdi-weight-lifter"
        if (sportType.indexOf("Ski") > 0) return "mdi-ski"
        return "mdi-dumbbell"
    }

    /**
     * Convert sport type enum to readable text (with spaces).
     * @param enumValue The sport type.
     */
    const getSportName = (enumValue: string): string => enumValue.replace(/([A-Z])/g, " $1").trim()

    /**
     * Get map of all record icons and their keys.
     */
    const getAllRecordIcons = (): Record<string, string> => recordIcons

    /**
     * Get record icon for the specified field.
     * @param field The record field.
     */
    const getRecordIcon = (field: string): string => recordIcons[field]

    /**
     * Helper to get field name from camelCase.
     * @param field The field name.
     */
    const getFriendlyUpdatedField = (field: string): string => field.replace(/([A-Z])/g, " $1").replace(/^./, (str) => str.toUpperCase())

    /**
     * Check if the passed activity has broken a personal record, and returns
     * an array with the record key (field) and its details.
     * @param activity The activity.
     */
    const isActivityRecord = (activity: any): [string, any] | false | null => {
        const records = store.athleteRecords
        if (!records) return false
        return records[activity.sportType] ? (Object.entries(records[activity.sportType]).find((e: any) => e[1].activityId == activity.id) as [string, any]) : null
    }

    /**
     * Extract activity ID from the passed value or URL.
     * @param idOrUrl Activity ID or URL.
     */
    const activityIdFromUrl = (idOrUrl: any): string => {
        let result = idOrUrl

        if (isNaN(idOrUrl)) {
            const arrUrl = idOrUrl.replace("https://", "").split("/")
            if (!idOrUrl.includes("strava.com")) {
                return null
            }
            if (arrUrl.length < 3) {
                return null
            }

            result = arrUrl[2]
        }

        if (isNaN(result)) {
            return null
        }

        return result
    }

    return {stravaStatus, getStravaStatus, getSportIcon, getSportName, getAllRecordIcons, getRecordIcon, getFriendlyUpdatedField, isActivityRecord, activityIdFromUrl}
}
