// Strautomator Core: Strava utils

import {StravaActivity, StravaClub, StravaClubEvent, StravaGear, StravaProfile} from "./types"
import {UserData} from "../users/types"
import {recipePropertyList} from "../recipes/lists"
import dayjs from "../dayjs"
import _ = require("lodash")

/**
 * Helper to transform data from the API to a StravaActivity interface.
 * @param data Input data.
 */
export function toStravaActivity(data: any, user: UserData): StravaActivity {
    const profile = user.profile
    const startDate = dayjs.utc(data.start_date)

    const activity: StravaActivity = {
        id: data.id,
        type: data.type,
        name: data.name,
        description: data.description,
        commute: data.commute,
        hideHome: data.hide_from_home,
        dateStart: startDate.toDate(),
        utcStartOffset: data.utc_offset,
        elevationGain: data.total_elevation_gain,
        elevationMax: data.elev_high,
        totalTime: data.elapsed_time,
        movingTime: data.moving_time,
        locationStart: data.start_latlng,
        locationEnd: data.end_latlng,
        hasPower: data.device_watts || false,
        wattsAvg: data.average_watts ? Math.round(data.average_watts) : null,
        wattsWeighted: data.weighted_average_watts ? Math.round(data.weighted_average_watts) : null,
        wattsMax: data.max_watts ? Math.round(data.max_watts) : null,
        hrAvg: data.average_heartrate ? Math.round(data.average_heartrate) : null,
        hrMax: data.max_heartrate ? Math.round(data.max_heartrate) : null,
        cadenceAvg: data.average_cadence || null,
        calories: data.calories || data.kilojoules || null,
        device: data.device_name,
        manual: data.manual,
        updatedFields: []
    }

    // Activity has location data?
    activity.hasLocation = (activity.locationStart && activity.locationStart.length > 0) || (activity.locationEnd && activity.locationEnd.length > 0)

    // Strava returns offset in seconds, but we store in minutes.
    if (activity.utcStartOffset) {
        activity.utcStartOffset = activity.utcStartOffset / 60
    }

    // Set end date.
    if (data.elapsed_time) {
        activity.dateEnd = startDate.add(data.elapsed_time, "s").toDate()
    }

    // Set activity gear.
    const gearId = data.gear && data.gear.id ? data.gear.id : data.gear_id
    if (gearId) {
        activity.gear = activity.gear = _.find(profile.bikes, {id: gearId}) || _.find(profile.shoes, {id: gearId})
    } else if (data.gear) {
        activity.gear = toStravaGear(data.gear.id, profile)
    }

    // Set polyline.
    if (data.map) {
        activity.polyline = data.map.polyline
    }

    // Default climbing ratio multiplier in metric is 19m / 1km.
    let cRatioMultiplier = 19

    // Convert values according to the specified units.
    if (profile.units == "imperial") {
        const feet = 3.28084
        const miles = 0.621371

        // Imperial climbing ration multiplier is 100ft / 1mi
        cRatioMultiplier = 100

        if (data.total_elevation_gain) {
            activity.elevationGain = Math.round(data.total_elevation_gain * feet)
        }
        if (data.elev_high) {
            activity.elevationMax = Math.round(data.elev_high * feet)
        }
        if (data.distance) {
            activity.distance = parseFloat(((data.distance / 1000) * miles).toFixed(1))
        }
        if (data.average_speed) {
            activity.speedAvg = parseFloat((data.average_speed * 3.6 * miles).toFixed(1))
        }
        if (data.max_speed) {
            activity.speedMax = parseFloat((data.max_speed * 3.6 * miles).toFixed(1))
        }
    } else {
        if (data.distance) {
            activity.distance = parseFloat((data.distance / 1000).toFixed(1))
        }
        if (data.average_speed) {
            activity.speedAvg = parseFloat((data.average_speed * 3.6).toFixed(1))
        }
        if (data.max_speed) {
            activity.speedMax = parseFloat((data.max_speed * 3.6).toFixed(1))
        }
    }

    // Get device temperature if available, using the correct weather unit.
    if (_.isNumber(data.average_temp)) {
        if (user.preferences && user.preferences.weatherUnit == "f") {
            activity.temperature = Math.round((data.average_temp / 5) * 9 + 32)
        } else {
            activity.temperature = Math.round(data.average_temp)
        }
    }

    // Calculate climbing ratio with 2 decimal places.
    if (activity.distance && activity.elevationGain) {
        const climbingRatio = activity.elevationGain / (activity.distance * cRatioMultiplier)
        activity.climbingRatio = Math.round(climbingRatio * 100) / 100
    }

    // Get activity emoticon.
    activity.icon = getActivityIcon(activity)

    return activity
}

/**
 * Helper to transform data from the API to a StravaGear interface.
 * @param data Input data.
 */
export function toStravaGear(data, profile: StravaProfile): StravaGear {
    const gear: StravaGear = {
        id: data.id,
        name: data.name || data.description,
        primary: data.primary,
        distance: data.distance / 1000
    }

    // Has brand and model?
    if (data.brand_name) {
        gear.brand = data.brand_name
    }
    if (data.model_name) {
        gear.model = data.model_name
    }

    // User using imperial units? Convert to miles.
    if (profile.units == "imperial" && gear.distance > 0) {
        const miles = 0.621371
        gear.distance = gear.distance * miles
    }

    // Round distance.
    gear.distance = Math.round(gear.distance)

    return gear
}

/**
 * Helper to transform data from the API to a StravaProfile interface.
 * @param data Input data.
 */
export function toStravaProfile(data): StravaProfile {
    const profile: StravaProfile = {
        id: data.id.toString(),
        username: data.username,
        firstName: data.firstname,
        lastName: data.lastname,
        city: data.city || null,
        country: data.country || null,
        dateCreated: dayjs.utc(data.created_at).toDate(),
        dateUpdated: dayjs.utc(data.updated_at).toDate(),
        units: data.measurement_preference == "feet" ? "imperial" : "metric",
        ftp: data.ftp || null,
        bikes: [],
        shoes: []
    }

    // Has bikes?
    if (data.bikes && data.bikes.length > 0) {
        for (let bike of data.bikes) {
            profile.bikes.push(toStravaGear(bike, profile))
        }
    }

    // Has shoes?
    if (data.shoes && data.shoes.length > 0) {
        for (let shoes of data.shoes) {
            profile.shoes.push(toStravaGear(shoes, profile))
        }
    }

    // Has profile image?
    if (data.profile) {
        profile.urlAvatar = data.profile

        // Relative avatar URL? Append Strava's base URL.
        if (profile.urlAvatar.indexOf("://") < 0) {
            profile.urlAvatar = `/images/avatar.png`
        }
    }

    return profile
}

/**
 * Helper to transform data from the API to a StravaClub interface.
 * @param data Input data.
 */
export function toStravaClub(data): StravaClub {
    const club: StravaClub = {
        id: data.id.toString(),
        name: data.name,
        url: data.url,
        sport: data.sport_type,
        type: data.club_type,
        photo: data.cover_photo,
        city: data.city,
        country: data.country,
        memberCount: data.member_count,
        private: data.private
    }

    return club
}

/**
 * Helper to transform data from the API to a StravaClubEvent interface.
 * @param data Input data.
 */
export function toStravaClubEvent(data): StravaClubEvent {
    const clubEvent: StravaClubEvent = {
        id: data.id,
        title: data.title,
        description: data.description,
        activityType: data.activity_type,
        dates: [],
        joined: data.joined,
        private: data.private,
        womenOnly: data.women_only,
        locationStart: data.start_latlng
    }

    if (data.organizing_athlete) {
        clubEvent.organizer = toStravaProfile(data.organizing_athlete)
    }

    if (data.upcoming_occurrences && data.upcoming_occurrences.length > 0) {
        clubEvent.dates = data.upcoming_occurrences.map((d) => dayjs(d).toDate())
    }

    return clubEvent
}

/**
 * Return activity icon (emoji) based on its type.
 * @param activity The relevant Strava activity.
 */
export function getActivityIcon(activity: StravaActivity): string {
    switch (activity.type) {
        case "Run":
        case "VirtualRun":
            return "🏃"
        case "Walk":
            return "🚶"
        case "Ride":
        case "EBikeRide":
        case "VirtualRide":
            return "🚲"
        case "Swim":
            return "🏊"
        case "AlpineSki":
        case "BackcountrySki":
        case "NordicSki":
            return "⛷"
        case "Snowboard":
            return "🏂"
        case "IceSkate":
        case "Snowshoe":
            return "⛸"
        case "Skateboard":
            return "🛹"
        case "RockClimbing":
            return "🧗"
        case "Surfing":
        case "Windsurf":
            return "🏄"
        case "Canoeing":
            return "🛶"
        case "Rowing":
            return "🚣"
        case "Sail":
            return "⛵"
        case "Golf":
            return "🏌"
        case "Soccer":
            return "⚽"
        case "Crossfit":
        case "Elliptical":
        case "WeightTraining":
            return "🏋"
        case "Yoga":
            return "🧘"
        case "Wheelchair":
            return "🧑‍🦽"
        default:
            return "👤"
    }
}

/**
 * Process the activity and add the necessary suffixes to its fields.
 * @param user The user owning the activity.
 * @param activity The Strava activity to be transformed.
 */
export const transformActivityFields = (user: UserData, activity: StravaActivity): void => {
    for (let prop of recipePropertyList) {
        let suffix = user.profile.units == "imperial" && prop.impSuffix ? prop.impSuffix : prop.suffix

        // Farenheit temperature suffix (special case).
        if (prop.fSuffix && user.preferences && user.preferences.weatherUnit == "f") {
            suffix = prop.fSuffix
        }

        // Make sure times are set using the format "HH:MM".
        if (prop.type == "time") {
            if (_.isNumber(activity[prop.value])) {
                const aDuration = dayjs.duration(activity[prop.value], "seconds")
                activity[prop.value] = aDuration.format("HH:mm")
            } else if (_.isDate(activity[prop.value])) {
                const aDate = dayjs.utc(activity[prop.value]).add(activity.utcStartOffset, "minutes")
                const format = prop.value.substring(0, 4) == "date" ? "L HH:mm" : "HH:mm"
                activity[prop.value] = aDate.format(format)
            }
        }

        // Append suffixes.
        if (suffix && !_.isNil(activity[prop.value]) && !_.isDate(activity[prop.value])) {
            activity[prop.value] = `${activity[prop.value]}${suffix}`
        }
    }
}
