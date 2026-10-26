// Strautomator Web: Day.js with the necessary plugins

import dayjs from "dayjs"
import advancedFormat from "dayjs/plugin/advancedFormat.js"
import duration from "dayjs/plugin/duration.js"
import localizedFormat from "dayjs/plugin/localizedFormat.js"
import relativeTime from "dayjs/plugin/relativeTime.js"
import utc from "dayjs/plugin/utc.js"

dayjs.extend(advancedFormat)
dayjs.extend(duration)
dayjs.extend(localizedFormat)
dayjs.extend(relativeTime)
dayjs.extend(utc)

export default defineNuxtPlugin(() => {
    return {
        provide: {dayjs}
    }
})
