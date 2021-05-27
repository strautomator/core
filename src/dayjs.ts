// Strautomator Core: Day.js wrapper

import dayjs from "dayjs"
import dayjsAdvancedFormat from "dayjs/plugin/advancedFormat"
import dayjsLocalizedFormat from "dayjs/plugin/localizedFormat"
import dayjsUTC from "dayjs/plugin/utc"
import dayjsWeekYear from "dayjs/plugin/weekYear"

// Extends dayjs with required plugins.
dayjs.extend(dayjsAdvancedFormat)
dayjs.extend(dayjsLocalizedFormat)
dayjs.extend(dayjsUTC)
dayjs.extend(dayjsWeekYear)

// Exports
export default dayjs
