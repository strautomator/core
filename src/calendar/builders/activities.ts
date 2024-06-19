// Strautomator Core: Calendar Activities Builder

import {ICalCalendar, ICalEventData} from "ical-generator"
import {CalendarCachedEvents, CalendarData} from "./../types"
import {UserCalendarTemplate, UserData} from "../../users/types"
import {recipePropertyList} from "../../recipes/lists"
import {StravaActivity, StravaBaseSport, StravaRideType, StravaRunType} from "../../strava/types"
import {transformActivityFields} from "../../strava/utils"
import maps from "../../maps"
import strava from "../../strava"
import _ from "lodash"
import jaul from "jaul"
import logger from "anyhow"
import * as logHelper from "../../loghelper"
import dayjs from "../../dayjs"
const settings = require("setmeup").settings

/**
 * Build the user activities events in the calendar. By default, activity events will be
 * cached in the storage bucket so we avoid getting older activities and speed up further builds.
 * @param user The user.
 * @param dbCalendar Calendar data.
 * @param cal The ical instance.
 * @param cachedEvents Cached events.
 */
export const buildActivities = async (user: UserData, dbCalendar: CalendarData, cal: ICalCalendar, cachedEvents: CalendarCachedEvents): Promise<void> => {
    const today = dayjs.utc().startOf("day")
    const daysFrom = dbCalendar.options.daysFrom
    const daysTo = dbCalendar.options.daysTo
    const dateFrom = today.subtract(daysFrom, "days")
    const dateTo = today.add(daysTo, "days").endOf("day")
    const optionsLog = `From ${dateFrom.format("ll")} to ${dateTo.format("ll")}`
    const partialFirstBuild = !dbCalendar.dateAccess && settings.calendar.partialFirstBuild
    const fieldSettings = settings.calendar.activityFields
    const calendarTemplate: UserCalendarTemplate = user.preferences?.calendarTemplate || {}

    let activities: StravaActivity[]
    try {
        logger.debug("Calendar.buildActivities", logHelper.user(user), optionsLog, "Preparing to build")

        if (cachedEvents) {
            let lastCachedDate = dateFrom

            // First we add the cached events.
            for (let id in cachedEvents) {
                const eventData = cachedEvents[id]
                try {
                    cal.createEvent(eventData)
                    dbCalendar.activityCount++
                    dbCalendar.cacheCount++
                } catch (cacheEx) {
                    logger.error("Calendar.buildActivities", logHelper.user(user), `Failure adding cached event ${id}`, cacheEx)
                }

                // Get the date of the last cached event and use it to filter live activities
                // by increasing the "after" query timestamp.
                const startDate = dayjs(eventData.start as string)
                if (lastCachedDate.isBefore(startDate)) {
                    lastCachedDate = startDate.add(1, "second")
                }
            }

            activities = await strava.activities.getActivities(user, {after: lastCachedDate, before: dateTo})
        } else {
            activities = await strava.activities.getActivities(user, {after: dateFrom, before: dateTo})
        }

        // Iterate and process live activities.
        for (let activity of activities) {
            if (partialFirstBuild && dbCalendar.activityCount >= settings.calendar.partialFirstBuild) continue
            if (dbCalendar.options.sportTypes && !dbCalendar.options.sportTypes.includes(activity.sportType)) continue
            if (dbCalendar.options.excludeCommutes && activity.commute) continue

            // For whatever reason Strava on rare occasions Strava returned no dates on activities, so double check it here.
            if (!activity.dateStart || !activity.dateEnd) {
                logger.info("Calendar.generate", logHelper.user(user), `${logHelper.activity(activity)} has no start or end date`)
                continue
            }

            // Activity event metadata.
            const eventId = `activity-${activity.id}`
            const arrDetails = []
            const startDate = activity.dateStart
            const endDate = activity.dateEnd
            const sportType = activity.sportType.toLowerCase()
            const similarSportType = StravaBaseSport[activity.sportType]?.toLowerCase()
            const activityLink = `https://www.strava.com/activities/${activity.id}`

            // Append suffixes to activity values.
            transformActivityFields(user, activity, dbCalendar.options.compact)

            // Replace boolean tags with yes or no.
            for (let field of Object.keys(activity)) {
                if (activity[field] === true) activity[field] = "yes"
                else if (activity[field] === false) activity[field] = "no"
            }

            // If no event details template was set, push default values to the details array.
            if (!calendarTemplate.eventDetails) {
                if (activity.workoutType == StravaRideType.Race || activity.workoutType == StravaRunType.Race) {
                    arrDetails.push("Race")
                } else if (activity.commute === ("yes" as any)) {
                    arrDetails.push("Commute")
                } else if (activity.trainer === ("yes" as any) && (similarSportType == "ride" || similarSportType == "run")) {
                    arrDetails.push("Virtual")
                }

                const activityFields = fieldSettings[sportType] || fieldSettings[similarSportType] || fieldSettings.default

                // Iterate default fields to be added to the event details.
                for (let f of activityFields) {
                    const subDetails = []
                    const arrFields = f.split(",")

                    for (let field of arrFields) {
                        field = field.trim()

                        if (activity[field]) {
                            const fieldInfo = _.find(recipePropertyList, {value: field})
                            const fieldName = fieldInfo ? fieldInfo.shortText || fieldInfo.text : field.charAt(0).toUpperCase() + field.slice(1)
                            subDetails.push(`${fieldName}: ${activity[field]}`)
                        }
                    }

                    arrDetails.push(subDetails.join("\n"))
                }

                if (dbCalendar.options.linkInDescription) {
                    arrDetails.push(activityLink)
                }
            }

            // Get summary and details from options or from defaults.
            try {
                const summaryTemplate = calendarTemplate?.eventSummary || settings.calendar.eventSummary
                const summary = jaul.data.replaceTags(summaryTemplate, activity, null, true)
                const details = calendarTemplate.eventDetails ? jaul.data.replaceTags(calendarTemplate.eventDetails, activity, null, true) : arrDetails.join(dbCalendar.options.compact ? "" : "\n")
                const eventData: ICalEventData = {
                    id: eventId,
                    start: startDate,
                    end: endDate,
                    summary: summary,
                    description: details,
                    url: activityLink
                }

                // Geo location available?
                if (activity.locationEnd?.length > 0) {
                    let locationString: string = activity.locationEnd.join(", ")

                    // PRO users will have the location parsed into an address.
                    if (user.isPro) {
                        try {
                            const address = await maps.getReverseGeocode(activity.locationEnd)
                            locationString = _.values(_.pick(address, ["neighborhood", "city", "country"])).join(", ")
                        } catch (locationEx) {
                            logger.error("Calendar.buildActivities", logHelper.user(user), logHelper.activity(activity), `Can't fetch address for ${locationString}`)
                        }
                    }

                    if (locationString) {
                        eventData.location = locationString
                    }
                }

                // Rare condition where an activity might have been already added to the calendar via cache.
                if (cachedEvents && cachedEvents[eventId]) {
                    const existing = _.remove(cal.events(), (e) => e.id() == eventId)
                    if (existing.length > 0) {
                        logger.warn("Calendar.buildActivities", logHelper.user(user), logHelper.activity(activity), "Duplicate from the cache, will replace it")
                        dbCalendar.activityCount--
                    }
                }

                // Add activity to the calendar.
                cal.createEvent(eventData)
                dbCalendar.activityCount++
            } catch (innerEx) {
                logger.error("Calendar.buildActivities", logHelper.user(user), logHelper.activity(activity), innerEx)
            }
        }
    } catch (ex) {
        logger.error("Calendar.buildActivities", logHelper.user(user), optionsLog, ex)
    }
}
