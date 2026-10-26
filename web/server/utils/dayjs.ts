// Strautomator Web: Day.js wrapper

import dayjs from "dayjs"
import dayjsAdvancedFormat from "dayjs/plugin/advancedFormat.js"
import dayjsLocalizedFormat from "dayjs/plugin/localizedFormat.js"
import dayjsUTC from "dayjs/plugin/utc.js"

// Extends dayjs with required plugins.
dayjs.extend(dayjsAdvancedFormat)
dayjs.extend(dayjsLocalizedFormat)
dayjs.extend(dayjsUTC)

// Exports
export default dayjs
