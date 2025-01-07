// Strautomator Core: Calendar GearWear Builder

import {ICalCalendar, ICalEventData} from "ical-generator"
import {CalendarData} from "./../types"
import {UserData} from "../../users/types"
import gearwear from "../../gearwear"
import _ from "lodash"
import logger from "anyhow"
import * as logHelper from "../../loghelper"
import dayjs from "../../dayjs"
const settings = require("setmeup").settings

/**
 * Build GearWear notifications and component replacements in the calendar.
 * This events will not be cached in the storage bucket.
 * @param user The user.
 * @param dbCalendar Calendar data.
 * @param cal The ical instance.
 */
export const buildGearWear = async (user: UserData, dbCalendar: CalendarData, cal: ICalCalendar): Promise<void> => {
    const debugLog = user.debug ? logger.warn : logger.debug
    const today = dayjs.utc().startOf("day")
    const daysFrom = dbCalendar.options.daysFrom
    const daysTo = dbCalendar.options.daysTo
    const dateFrom = today.subtract(daysFrom, "days")
    const dateTo = today.add(daysTo, "days").endOf("day")
    const optionsLog = `From ${dateFrom.format("ll")} to ${dateTo.format("ll")}`
    const distanceUnits = user.profile.units == "imperial" ? "mi" : "km"

    try {
        debugLog("Calendar.buildGearWear", logHelper.user(user), optionsLog, "Preparing to build")

        // Process all GearWear configurations.
        let gearwearConfigs = await gearwear.getByUser(user)
        for (let gear of gearwearConfigs) {
            const bike = _.find(user.profile.bikes, {id: gear.id})
            const shoe = _.find(user.profile.shoes, {id: gear.id})
            const gearDetails = bike || shoe

            // If the user has recently deleted the gear, stop here.
            if (!gearDetails) {
                logger.warn("Calendar.buildGearWear", logHelper.user(user), optionsLog, `Gear ${gear.id} not found in user profile`)
                continue
            }

            const gearIcon = bike ? "🚲" : "👟"
            const brandModel = _.compact(_.values(_.pick(gearDetails, ["brand", "model"])))
            const gearTitle = `${bike ? "Bike" : "Shoes"}: ${brandModel.length > 0 ? brandModel.join(" ") : gearDetails.name}`

            // Process each of the gear components.
            for (let comp of gear.components) {
                const events: ICalEventData[] = []
                const compId = `-${comp.name}-`.replace(/[^a-zA-Z0-9]/g, "").toLowerCase()
                const gearCompTitle = `${gearDetails.name} ${gearIcon} ${comp.name}`

                // If an alert was sent to replace the component, create an event 2 days later.
                if (comp.dateAlertSent) {
                    const eventDate = dayjs(comp.dateAlertSent).add(2, "days").hour(20).minute(0).second(0)
                    const eventId = `gear-${gear.id}-${compId}-${Math.round(comp.dateAlertSent.valueOf() / 10000)}`
                    const hours = ((comp.currentTime || 0) / 3600).toFixed(1).replace(".0", "")
                    const arrDescription = [gearTitle, `Friendly reminder to replace the ${comp.name}.`, `Current usage: ${comp.currentDistance} ${distanceUnits}, ${hours} hours.`]
                    events.push({
                        id: eventId,
                        start: eventDate.toDate(),
                        end: eventDate.add(settings.calendar.eventDurationMinutes, "minutes").toDate(),
                        summary: `${gearCompTitle} ℹ️`,
                        description: arrDescription.join("\n"),
                        url: `${settings.app.url}gear/edit?id=${gear.id}`
                    })
                }

                // Iterate and process all historical changes to this the component.
                for (let history of comp.history) {
                    const eventDate = dayjs(history.date)
                    const eventId = `gear-${gear.id}-${compId}-${Math.round(history.date.valueOf() / 10000)}`
                    const hours = ((history.time || 0) / 3600).toFixed(1).replace(".0", "")
                    const arrDescription = [gearTitle, `Component replaced after ${history.distance} ${distanceUnits}, ${hours} hours.`]
                    events.push({
                        id: eventId,
                        start: eventDate.toDate(),
                        end: eventDate.add(settings.calendar.eventDurationMinutes, "minutes").toDate(),
                        summary: `${gearCompTitle} 🔄`,
                        description: arrDescription.join("\n"),
                        url: `${settings.app.url}gear/edit?id=${gear.id}`
                    })
                }

                // Append all created events to the calendar.
                events.forEach((e) => cal.createEvent(e))
                dbCalendar.gearEventCount += events.length
            }

            // Process device battery tracker.
            const batteryTracker = await gearwear.getBatteryTracker(user)
            if (batteryTracker) {
                batteryTracker.devices.forEach((device) => {
                    if (["low", "critical"].includes(device.status)) {
                        const eventDate = dayjs(device.dateUpdated)
                        const reminderDate = eventDate.add(2, "days").hour(20).minute(0).second(0)

                        cal.createEvent({
                            id: `battery-${device.id}`,
                            start: eventDate.toDate(),
                            end: eventDate.add(settings.calendar.eventDurationMinutes, "minutes").toDate(),
                            summary: `Battery ${device.status}: ${device.id} 🪫`,
                            description: `Device ${device.id} battery status was reported as ${device.status.toUpperCase()}.`,
                            url: `${settings.app.url}gear`
                        })

                        // Create a reminder event to recharge the battery.
                        if (reminderDate.isAfter(new Date())) {
                            cal.createEvent({
                                id: `battery-${device.id}-reminder`,
                                start: eventDate.toDate(),
                                end: eventDate.add(settings.calendar.eventDurationMinutes, "minutes").toDate(),
                                summary: `Reminder to recharge the battery: ${device.id} 🔋`,
                                description: `Friendly reminder to recharge (or replace) the batteries for the device ${device.id}.`,
                                url: `${settings.app.url}gear`
                            })
                        }
                    }
                })
            }
        }
    } catch (ex) {
        logger.error("Calendar.buildGearWear", logHelper.user(user), optionsLog, ex)
    }
}
