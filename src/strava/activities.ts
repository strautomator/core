// Strautomator Core: Strava Activities

import {StravaActivity, StravaActivityStreams, StravaGear} from "./types"
import {toStravaActivity} from "./utils"
import {UserData} from "../users/types"
import stravaAthletes from "./athletes"
import api from "./api"
import _ = require("lodash")
import logger = require("anyhow")
import dayjs from "../dayjs"
const settings = require("setmeup").settings

/**
 * Strava activities manager.
 */
export class StravaActivities {
    private constructor() {}
    private static _instance: StravaActivities
    static get Instance(): StravaActivities {
        return this._instance || (this._instance = new this())
    }

    /**
     * Holds the date of the oldest queued activity to be processed.
     */
    oldestQueueDate: Date = null

    // GET ACTIVITIES
    // --------------------------------------------------------------------------

    /**
     * Get list of activities from Strava.
     * @param user The owner of the activity.
     * @param query Query options.
     * @param checkRecords If true, new records will be checked against the resulting activities.
     */
    getActivities = async (user: UserData, query: any, checkRecords?: boolean): Promise<StravaActivity[]> => {
        const arrLogQuery = query ? Object.entries(query).map((p) => p[0] + "=" + p[1]) : ["no query"]
        const logQuery = arrLogQuery.join(", ")

        try {
            const tokens = user.stravaTokens
            const activities: StravaActivity[] = []

            // Default query options.
            if (!query.per_page) query.per_page = 200
            if (!query.page) query.page = 1

            // Fetch activities from Strava, respecting the pagination.
            while (query.page) {
                try {
                    const data = await api.get(tokens, "athlete/activities", query)

                    // No data returned? Stop here.
                    if (!data || data.length == 0) {
                        query.page = false
                        break
                    }

                    // Iterate and transform activities from raw strava data to StravaActivity models.
                    for (let activity of data) {
                        activities.push(toStravaActivity(user, activity))
                    }

                    // If count is more than half the page size, consider it might have more and increment the page.
                    if (data.length >= query.per_page / 2) {
                        query.page++
                    } else {
                        query.page = false
                        break
                    }
                } catch (innerEx) {
                    logger.error("Strava.getActivities", `User ${user.id} ${user.displayName}`, logQuery, `Page ${query.page}`, innerEx)
                    query.page = false
                }
            }

            logger.info("Strava.getActivities", `User ${user.id} ${user.displayName}`, logQuery, `Got ${activities.length} activities`)

            // Check new records?
            if (checkRecords) {
                stravaAthletes.checkActivityRecords(user, activities)
            }

            return activities
        } catch (ex) {
            logger.error("Strava.getActivities", `User ${user.id} ${user.displayName}`, logQuery, ex)
            throw ex
        }
    }

    /**
     * Get a single activity from Strava.
     * @param user The owner of the activity.
     * @param id The activity ID.
     */
    getActivity = async (user: UserData, id: number | string): Promise<StravaActivity> => {
        try {
            const tokens = user.stravaTokens
            const data = await api.get(tokens, `activities/${id}`, {include_all_efforts: 0})
            const activity = toStravaActivity(user, data)

            // Activity's gear was set?
            // First we try fetching gear details from cached database user.
            // Otherwise get directly from the API.
            if (data.gear_id) {
                try {
                    let gear: StravaGear

                    // Search for bikes.
                    for (let bike of user.profile.bikes) {
                        if (bike.id == id) {
                            gear = bike
                        }
                    }

                    // Search for shoes.
                    for (let shoe of user.profile.shoes) {
                        if (shoe.id == id) {
                            gear = shoe
                        }
                    }

                    // Set correct activity gear.
                    activity.gear = gear ? gear : await stravaAthletes.getGear(user, data.gear_id)
                } catch (ex) {
                    logger.warn("Strava.getActivity", id, "Could not get activity's gear details")
                }
            } else {
                activity.gear = null
            }

            // Get start time and timezone to be logged.
            let timeStart
            if (activity.dateStart) {
                const offset = activity.utcStartOffset > 0 ? `+${activity.utcStartOffset}` : activity.utcStartOffset
                timeStart = `${dayjs.utc(activity.dateStart).format("LTS")}, offset ${offset}`
            } else {
                timeStart = "No dateStart"
            }

            logger.info("Strava.getActivity", `User ${user.id} ${user.displayName}`, `Activity ${id}`, activity.name, timeStart)
            return activity
        } catch (ex) {
            if (!user) {
                logger.error("Strava.getActivity", "Missing user", `Activity ${id}`, ex)
            } else if (ex.toString().includes("404")) {
                logger.warn("Strava.getActivity", `User ${user.id} ${user.displayName}`, `Activity ${id}`, ex)
            } else {
                logger.error("Strava.getActivity", `User ${user.id} ${user.displayName}`, `Activity ${id}`, ex)
            }

            throw ex
        }
    }

    /**
     * Get an activity streams. At the moment only the "watts" stream is relevant.
     * @param user The owner of the activity.
     * @param id The activity ID.
     */
    getStreams = async (user: UserData, id: number | string): Promise<StravaActivityStreams> => {
        try {
            const tokens = user.stravaTokens
            const data = await api.get(tokens, `activities/${id}/streams`, {keys: "watts", key_by_type: true})
            const keys = Object.keys(data)

            logger.info("Strava.getStreams", `User ${user.id} ${user.displayName}`, `Activity ${id}`, keys.join(", "))
            return data
        } catch (ex) {
            logger.error("Strava.getStreams", `User ${user.id} ${user.displayName}`, `Activity ${id}`, ex)
            throw ex
        }
    }

    // UPDATING ACTIVITIES
    // --------------------------------------------------------------------------

    /**
     * Updates a single activity on Strava.
     * @param user Owner of the activity.
     * @param activity The ativity data.
     */
    setActivity = async (user: UserData, activity: StravaActivity): Promise<void> => {
        const data: any = {}
        const logResult = []
        const useHashtag = user.preferences.activityHashtag

        // Add link back to Strautomator on some percentage of activities (depending on user PRO status and settings).
        // If user has a custom linksOn, it will add the linkback even if user has PRO status.
        const defaultLinksOn = user.isPro ? 0 : settings.plans.free.linksOn
        const linksOn = user.preferences ? user.preferences.linksOn || defaultLinksOn : defaultLinksOn
        const shouldAddLink = (!user.isPro || linksOn > 0) && user.activityCount > 0 && user.activityCount % linksOn == 0 && settings.app.url

        try {
            if (!activity.updatedFields || activity.updatedFields.length == 0) {
                logger.info("Strava.setActivity", `${activity.id}, from user ${user.id}`, "No fields were updated")
                return
            }

            // Time to add a linkback on the activity?
            if (shouldAddLink) {
                activity.linkback = true

                // By default, link will be added to the description.
                if (!useHashtag) {
                    let appUrl = settings.app.url

                    // Make sure app URL does not end with / (better optics).
                    if (appUrl.substring(appUrl.length - 1) == "/") {
                        appUrl = appUrl.substring(0, appUrl.length - 1)
                    }

                    // Only proceed if a linkback was not previously added.
                    const alreadyLinked = activity.description ? activity.description.includes(appUrl) : false
                    if (!alreadyLinked) {
                        const linkTexts = settings.recipes.linksTexts
                        let text = _.sample(linkTexts)

                        // If activity has a description, add link on a new line.
                        if (activity.description && activity.description.length > 0) {
                            text = `\n\n${text}`
                        } else {
                            activity.description = ""
                        }

                        // Update description with link-back and add to list of updated fields.
                        activity.description += `${text} ${appUrl}`

                        if (!activity.updatedFields.includes("description")) {
                            activity.updatedFields.push("description")
                        }
                    } else {
                        logResult.push("Linkback already present on description")
                    }
                }

                // User has set the hashtag preference? Add it to the name of the activity instead, but
                // only if no hashtag was previously set on the activity.
                else {
                    const alreadyLinked = activity.name ? activity.name.includes(settings.app.hashtag) : false
                    if (!alreadyLinked) {
                        if (!activity.name) {
                            activity.name = ""
                        }

                        activity.name += ` ${settings.app.hashtag}`

                        if (!activity.updatedFields.includes("name")) {
                            activity.updatedFields.push("name")
                        }
                    } else {
                        logResult.push("Linkback hashtag already present on name")
                    }
                }
            }

            // Set correct fields to be updated on the activity.
            for (let field of activity.updatedFields) {
                let targetField = field
                let targetValue = activity[field]
                let targetName = null

                // Fields might need additional processing or transformation, so we handle
                // each individual case down below.
                if (field == "gear") {
                    targetField = "gear_id"
                    targetValue = activity.gear.id
                    targetName = activity.gear.name
                } else if (field == "sportType") {
                    targetField = "sport_type"
                } else if (field == "hideHome") {
                    targetField = "hide_from_home"
                } else if (field == "workoutType") {
                    targetField = "workout_type"
                } else if (field == "privateNote") {
                    targetField = "private_note"
                } else if (field == "mapStyle") {
                    targetField = "selected_polyline_style"
                } else if (field.substring(0, 8) == "hideStat") {
                    targetField = ""
                    targetValue = targetValue === true ? "only_me" : "everyone"

                    if (!data.stats_visibility) data.stats_visibility = []
                    const arrFieldName = field.replace("hideStat", "").split(/(?=[A-Z])/)
                    data.stats_visibility.push({type: arrFieldName.join("_").toLowerCase(), visibility: targetValue})
                }

                let targetLog = `${field}=${targetName || (activity[field] || activity[targetField]).replace(/\n/, " ")}`

                if (targetField) {
                    data[targetField] = targetValue
                }

                logResult.push(targetLog)
            }

            // If running on test mode, log the activity instead.
            if (settings.strava.testMode) {
                logger.warn("Strava.setActivity", "TEST MODE (do not write to Strava)", activity.id, logResult.join(", "))
            } else {
                await api.put(user.stravaTokens, `activities/${activity.id}`, null, data)
                logger.info("Strava.setActivity", `${activity.id}, from user ${user.id}`, logResult.join(", "))
            }
        } catch (ex) {
            logger.error("Strava.setActivity", `${activity.id}, from user ${user.id}`, logResult.join(", "), ex)
            throw ex
        }
    }
}

// Exports...
export default StravaActivities.Instance
