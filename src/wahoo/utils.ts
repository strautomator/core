// Strautomator Core: Wahoo Utils

import {WahooActivity} from "./types"
import dayjs from "../dayjs"

/**
 * Helper to transform raw data from the API to a Wahoo activity.
 * @param data Input data.
 */
export function toWahooActivity(data: any): WahooActivity {
    const summary = data.workout_summary

    const result: WahooActivity = {
        id: data.id,
        name: data.name,
        dateStart: dayjs(data.starts).toDate()
    }

    if (data.minutes) {
        result.minutes = parseFloat(data.minutes)
    }

    if (summary) {
        result.speedAvg = parseFloat(summary.speed_avg)
        if (summary.file?.url) {
            result.fileUrl = summary.file.url
        }
    }

    return result
}
