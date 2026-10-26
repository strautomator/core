// Strautomator Core: Day.js wrapper

import dayjs from "dayjs"
import dayjsAdvancedFormat from "dayjs/plugin/advancedFormat"
import dayjsLocalizedFormat from "dayjs/plugin/localizedFormat"
import dayjsUTC from "dayjs/plugin/utc"
import dayjsWeekYear from "dayjs/plugin/weekYear"
import dayjsWeekOfYear from "dayjs/plugin/weekOfYear"
import dayjsDayOfYear from "dayjs/plugin/dayOfYear"
import dayjsDuration from "dayjs/plugin/duration"
import dayjsRelativeTime from "dayjs/plugin/relativeTime"
import "dayjs/locale/de"
import "dayjs/locale/en"
import "dayjs/locale/es"
import "dayjs/locale/fr"
import "dayjs/locale/it"
import "dayjs/locale/lt"
import "dayjs/locale/nl"
import "dayjs/locale/pl"

// Extends dayjs with required plugins.
dayjs.extend(dayjsAdvancedFormat)
dayjs.extend(dayjsLocalizedFormat)
dayjs.extend(dayjsUTC)
dayjs.extend(dayjsWeekYear)
dayjs.extend(dayjsWeekOfYear)
dayjs.extend(dayjsDayOfYear)
dayjs.extend(dayjsDuration)
dayjs.extend(dayjsRelativeTime)

// Exports
export default dayjs
