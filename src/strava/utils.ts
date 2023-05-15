// Strautomator Core: Strava Utils

import {StravaActivity, StravaClub, StravaClubEvent, StravaGear, StravaLap, StravaProfile, StravaProfileStats, StravaRoute, StravaSport, StravaTotals} from "./types"
import {UserData} from "../users/types"
import {recipePropertyList} from "../recipes/lists"
import maps from "../maps"
import dayjs from "../dayjs"
import _ from "lodash"
import polyline = require("@mapbox/polyline")

// Feet and miles ratio.
const rFeet = 3.28084
const rMiles = 0.621371

/**
 * Helper to transform data from the API to a StravaActivity interface.
 * @param user The activity owner.
 * @param data Input data.
 */
export function toStravaActivity(user: UserData, data: any): StravaActivity {
    const profile = user.profile
    const startDate = dayjs.utc(data.start_date)

    const activity: StravaActivity = {
        id: data.id,
        type: data.type || data.sport_type,
        sportType: data.sport_type || data.type,
        name: data.name,
        description: data.description,
        flagged: data.flagged ? true : false,
        private: data.private ? true : false,
        commute: data.commute ? true : false,
        hideHome: data.hide_from_home ? true : false,
        trainer: data.trainer ? true : false,
        dateStart: startDate.toDate(),
        weekOfYear: startDate.week(),
        utcStartOffset: data.utc_offset,
        totalTime: data.elapsed_time,
        movingTime: data.moving_time || data.elapsed_time,
        locationStart: data.start_latlng,
        locationEnd: data.end_latlng,
        hasPower: data.device_watts ? true : false,
        wattsAvg: data.average_watts ? Math.round(data.average_watts) : null,
        wattsWeighted: data.weighted_average_watts ? Math.round(data.weighted_average_watts) : null,
        wattsMax: data.max_watts ? Math.round(data.max_watts) : null,
        wattsKg: data.average_watts && user.profile.weight ? parseFloat((data.average_watts / user.profile.weight).toFixed(1)) : null,
        hrAvg: data.average_heartrate ? Math.round(data.average_heartrate) : null,
        hrMax: data.max_heartrate ? Math.round(data.max_heartrate) : null,
        cadenceAvg: data.average_cadence || null,
        calories: data.calories || null,
        relativeEffort: data.suffer_score || null,
        device: data.device_name || null,
        manual: data.manual,
        hasPhotos: data.photos && data.photos.count > 0 ? true : false,
        updatedFields: []
    }

    // Get elapsed and moving times as HH:MM:SS strings.
    if (activity.totalTime > 0) {
        activity.totalTimeString = dayjs.duration(activity.totalTime, "seconds").format("HH:mm:ss")
    }
    if (activity.movingTime > 0) {
        activity.movingTimeString = dayjs.duration(activity.movingTime, "seconds").format("HH:mm:ss")
    }

    // Get coordinates from polyline, and make sure start and end locations are
    // populated if coming empty from the Strava API for whatever reason.
    if (activity.polyline) {
        const coordinates = polyline.decode(activity.polyline)

        if (coordinates.length > 0) {
            if (!activity.locationStart || !activity.locationStart.length) {
                activity.locationStart = coordinates[0]
            }
            if (!activity.locationEnd || !activity.locationEnd.length) {
                activity.locationEnd = coordinates[coordinates.length - 1]
            }

            // Calculate activity mid point.
            activity.locationMid = coordinates[Math.round(coordinates.length / 2)]
        }
    }

    // Extra optional fields.
    activity.hasLocation = activity.locationStart?.length > 0 || activity.locationEnd?.length > 0
    activity.hasCadence = activity.cadenceAvg && activity.cadenceAvg > 0

    if (data.workout_type && data.workout_type != 0 && data.workout_type != 10) {
        activity.workoutType = data.workout_type
    }
    if (data.private_note) {
        activity.privateNote = data.private_note
    }
    if (data.perceived_exertion) {
        activity.perceivedExertion = data.perceived_exertion
    }
    if (data.stats_visibility && data.stats_visibility.length > 0) {
        for (let sv of data.stats_visibility) {
            if (sv.type == "pace") activity.hideStatPace = sv.visibility == "only_me"
            else if (sv.type == "speed") activity.hideStatSpeed = sv.visibility == "only_me"
            else if (sv.type == "calories") activity.hideStatCalories = sv.visibility == "only_me"
            else if (sv.type == "heart_rate") activity.hideStatHeartRate = sv.visibility == "only_me"
            else if (sv.type == "power") activity.hideStatPower = sv.visibility == "only_me"
        }
    }

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
        activity.gear = toStravaGear(profile, data.gear.id)
    }

    // Set polyline.
    if (data.map) {
        activity.polyline = data.map.polyline
    }

    // Activity laps.
    const laps: StravaLap[] = data.laps && data.laps.length > 0 ? [] : null
    if (laps) {
        for (let lap of data.laps) {
            laps.push({distance: lap.distance, totalTime: lap.elapsed_time, movingTime: lap.moving_time, speed: lap.average_speed})
        }
    }

    // Climbing ratio multiplier in metric is 19m / 1km.
    // Distance and elevation are already in metric by default.
    let cRatioMultiplier = 19
    let distanceMultiplier = 1
    let elevationMultiplier = 1

    // Conversion to imperial units.
    // Climbing ration multiplier is 100ft / 1mi.
    // Speeds are in mph, distance in miles, and elevation in feet.
    if (profile.units == "imperial") {
        cRatioMultiplier = 100
        distanceMultiplier = rMiles
        elevationMultiplier = rFeet
    }

    // Speed, distance and elevation.
    let avgSpeed: number = data.average_speed * 3.6 * distanceMultiplier
    let maxSpeed: number = data.max_speed * 3.6 * distanceMultiplier
    let distance: number = (data.distance / 1000) * distanceMultiplier
    let elevationGain: number = data.total_elevation_gain * elevationMultiplier
    let elevationMax: number = data.elev_high * elevationMultiplier

    // Calculate pace in minutes, and get seconds with leading 0.
    let paceDurationAvg = dayjs.duration(60 / avgSpeed, "minutes")
    let avgPaceMinutes = paceDurationAvg.minutes()
    let avgPaceSeconds: any = paceDurationAvg.seconds()
    if (paceDurationAvg.milliseconds() > 500) avgPaceSeconds += 1
    if (avgPaceSeconds < 10) avgPaceSeconds = `0${avgPaceSeconds}`
    let paceDurationMax = dayjs.duration(60 / maxSpeed, "minutes")
    let maxPaceMinutes = paceDurationMax.minutes()
    let maxPaceSeconds: any = paceDurationMax.seconds()
    if (paceDurationMax.milliseconds() > 500) maxPaceSeconds += 1
    if (maxPaceSeconds < 10) maxPaceSeconds = `0${maxPaceSeconds}`

    // Append distance, elevation, speed and pace.
    if (!_.isNil(data.total_elevation_gain)) {
        activity.elevationGain = Math.round(elevationGain)
    }
    if (!_.isNil(data.elev_high)) {
        activity.elevationMax = Math.round(elevationMax)
    }
    if (activity.elevationGain > 0 || activity.elevationMax > 0) {
        activity.elevationUnit = user.profile.units == "imperial" ? "ft" : "m"
    }
    if (data.distance) {
        activity.distance = parseFloat(distance.toFixed(1))
        activity.distanceUnit = user.profile.units == "imperial" ? "miles" : "km"
    }
    if (data.average_speed) {
        activity.speedAvg = parseFloat(avgSpeed.toFixed(1))
        activity.paceAvg = parseFloat(`${avgPaceMinutes}.${avgPaceSeconds}`).toFixed(2).replace(".", ":")
    }
    if (data.max_speed) {
        activity.speedMax = parseFloat(maxSpeed.toFixed(1))
        activity.paceMax = parseFloat(`${maxPaceMinutes}.${maxPaceSeconds}`).toFixed(2).replace(".", ":")
    }
    if (activity.speedAvg > 0 || activity.speedMax > 0) {
        activity.speedUnit = user.profile.units == "imperial" ? "mi/h" : "km/h"
    }

    // Set lap distances and speed.
    if (laps) {
        laps.forEach((lap) => {
            lap.distance = parseFloat(((lap.distance / 1000) * distanceMultiplier).toFixed(1))
            lap.speed = parseFloat((lap.speed * 3.6 * distanceMultiplier).toFixed(1))
        })
    }

    // Lap summaries.
    if (laps) {
        activity.lapCount = laps.length

        const lapDistances = _.map(laps, "distance")
        const commonDistance = _.chain(lapDistances).countBy().entries().maxBy(_.last).value()
        const lapTimes = _.map(laps, (t) => Math.ceil(t.totalTime / 10) * 10)
        const commonTime = _.chain(lapTimes).countBy().entries().maxBy(_.last).value()

        // If 70% or more of laps have the same distance, use it as the
        // activity "lapDistance", otherwise calculate the average for all laps.
        if ((commonTime[1] as number) / laps.length >= 0.7) {
            activity.lapDistance = parseFloat(commonDistance[0] as string)
        } else {
            activity.lapDistance = parseFloat(_.mean(lapDistances).toFixed(1))
        }

        // Same principle again, but for lap times.
        if ((commonTime[1] as number) / laps.length >= 0.7) {
            activity.lapTime = parseFloat(commonTime[0] as string)
        } else {
            activity.lapTime = Math.round(_.mean(lapTimes))
        }
    }

    // Get device temperature if available, using the correct weather unit.
    if (_.isNumber(data.average_temp)) {
        if (user.preferences.weatherUnit == "f") {
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

    // Calculate TSS if possible.
    if (user.profile?.ftp && activity.hasPower && activity.wattsWeighted) {
        const intensity = activity.wattsWeighted / user.profile.ftp
        const tss = ((activity.wattsWeighted * intensity * activity.movingTime) / (user.profile.ftp * 3600)) * 100
        activity.tss = Math.round(tss)
    }

    // Check for new PRs and KOMs.
    if (data.segment_efforts?.length > 0) {
        const pr: any[] = data.segment_efforts.filter((r) => r.pr_rank == 1)
        const kom: any[] = data.segment_efforts.filter((r) => r.kom_rank == 1)

        if (pr.length > 0) {
            activity.prSegments = pr.map((r) => r.name)
        }
        if (kom.length > 0) {
            activity.komSegments = kom.map((r) => r.name)
        }
    }

    // Get activity emoticon.
    activity.icon = getSportIcon(activity)

    return activity
}

/**
 * Helper to transform data from the API to a StravaGear interface.
 * @param data Input data.
 */
export function toStravaGear(profile: StravaProfile, data: any): StravaGear {
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
export function toStravaProfile(data: any): StravaProfile {
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
        weight: data.weight || null,
        bikes: [],
        shoes: []
    }

    // Has bikes?
    if (data.bikes && data.bikes.length > 0) {
        for (let bike of data.bikes) {
            profile.bikes.push(toStravaGear(profile, bike))
        }
    }

    // Has shoes?
    if (data.shoes && data.shoes.length > 0) {
        for (let shoes of data.shoes) {
            profile.shoes.push(toStravaGear(profile, shoes))
        }
    }

    // Has profile image?
    if (data.profile) {
        profile.urlAvatar = data.profile

        // Relative avatar URL? Append Strava's base URL.
        if (!profile.urlAvatar.includes("://")) {
            profile.urlAvatar = `/images/avatar.png`
        }
    }

    return profile
}

/**
 * Helper to transform data from the API to a StravaProfileStats interface.
 * @param user The profile owner.
 * @param data Input data.
 */
export function toStravaProfileStats(user: UserData, data: any): StravaProfileStats {
    const stats: StravaProfileStats = {}
    const recentRideTotals = toStravaTotals(user, data.recent_ride_totals)
    const recentRunTotals = toStravaTotals(user, data.recent_run_totals)
    const recentSwimTotals = toStravaTotals(user, data.recent_swim_totals)
    const allRideTotals = toStravaTotals(user, data.all_ride_totals)
    const allRunTotals = toStravaTotals(user, data.all_run_totals)
    const allSwimTotals = toStravaTotals(user, data.all_swim_totals)

    // Append only totals with an actual value.
    if (recentRideTotals) stats.recentRideTotals = recentRideTotals
    if (recentRunTotals) stats.recentRideTotals = recentRunTotals
    if (recentSwimTotals) stats.recentRideTotals = recentSwimTotals
    if (allRideTotals) stats.recentRideTotals = allRideTotals
    if (allRunTotals) stats.recentRideTotals = allRunTotals
    if (allSwimTotals) stats.recentRideTotals = allSwimTotals

    // Convert values according to the specified units.
    if (user.profile.units == "imperial") {
        if (data.distance) {
            stats.biggestRideDistance = parseFloat(((data.biggest_ride_distance / 1000) * rMiles).toFixed(1))
        }
        if (data.elevation_gain) {
            stats.biggestRideClimb = Math.round(data.biggest_climb_elevation_gain * rFeet)
        }
    } else {
        if (data.distance) {
            stats.biggestRideDistance = parseFloat((data.biggest_ride_distance / 1000).toFixed(1))
        }
        if (data.elevation_gain) {
            stats.biggestRideClimb = data.biggest_climb_elevation_gain
        }
    }

    return stats
}
/**
 * Helper to transform data from the API to a StravaTotals interface.
 * @param user The activities owner.
 * @param data Input data.
 */
export function toStravaTotals(user: UserData, data: any): StravaTotals {
    if (data.count < 1) {
        return null
    }

    const totals: StravaTotals = {
        count: data.count,
        totalTime: data.elapsed_time,
        movingTime: data.moving_time
    }

    if (data.achievement_count > 0) {
        totals.achievements = data.achievement_count
    }

    // Convert values according to the specified units.
    if (user.profile.units == "imperial") {
        if (data.distance) {
            totals.distance = parseFloat(((data.distance / 1000) * rMiles).toFixed(1))
        }
        if (data.elevation_gain) {
            totals.elevationGain = Math.round(data.total_elevation_gain * rFeet)
        }
    } else {
        if (data.distance) {
            totals.distance = parseFloat((data.distance / 1000).toFixed(1))
        }
        if (data.elevation_gain) {
            totals.elevationGain = data.elevation_gain
        }
    }

    return totals
}

/**
 * Helper to transform data from the API to a StravaClub interface.
 * @param data Input data.
 */
export function toStravaClub(data: any): StravaClub {
    const club: StravaClub = {
        id: data.id.toString(),
        name: data.name,
        url: data.url,
        sport: data.sport_type,
        type: data.club_type,
        icon: data.profile_medium,
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
export function toStravaClubEvent(data: any): StravaClubEvent {
    const clubEvent: StravaClubEvent = {
        id: data.id,
        title: data.title,
        description: data.description,
        type: data.activity_type,
        dates: [],
        joined: data.joined,
        private: data.private,
        womenOnly: data.women_only,
        address: data.address
    }

    if (data.upcoming_occurrences && data.upcoming_occurrences.length > 0) {
        clubEvent.dates = data.upcoming_occurrences.map((d) => dayjs(d).toDate())
    }

    // Fill in the club's ID and name right away. Further details can then be
    // fetched using the club ID later on.
    if (data.club) {
        clubEvent.club = {
            id: data.club.id,
            name: data.club.name
        }
    }

    // Club event has a route defined? Set the base route details. Further details
    // can be fetched using the route ID later on.
    if (data.route && data.route.id_str) {
        clubEvent.route = {
            id: data.route.id,
            idString: data.route.id_str,
            name: data.route.name
        }
        if (data.route.map) {
            clubEvent.route.polyline = data.route.map.polyline || data.route.map.summary_polyline
        }
    }

    // Who's organizing it?
    if (data.organizing_athlete) {
        clubEvent.organizer = toStravaProfile(data.organizing_athlete)
    }

    return clubEvent
}

/**
 * Helper to transform data from the API to a StravaRoute interface.
 * @param user The user.
 * @param data Input data.
 */
export function toStravaRoute(user: UserData, data: any): StravaRoute {
    const multDistance = user.profile.units == "imperial" ? 0.621371 : 1
    const multFeet = user.profile.units == "imperial" ? 3.28084 : 1
    const distance = parseFloat((((data.distance || 0) / 1000) * multDistance).toFixed(1))
    const elevationGain = Math.round((data.elevation_gain || 0) * multFeet)

    const route: StravaRoute = {
        id: data.id,
        idString: data.id_str,
        name: data.name,
        description: data.description,
        distance: Math.round(distance),
        elevationGain: elevationGain,
        polyline: data.map.polyline || data.map.summary_polyline || null,
        type: data.type == 1 ? StravaSport.Ride : StravaSport.Run
    }

    // Estimated moving time available?
    if (data.estimated_moving_time) {
        route.estimatedTime = data.estimated_moving_time
    }

    // Terrain type available?
    if (data.terrain) {
        route.terrain = data.terrain
    }

    // Has polyline set? Get the start / mid / end coordinates.
    if (route.polyline) {
        const coordinates = maps.polylines.decode(route.polyline)
        route.locationStart = coordinates[0] as [number, number]
        route.locationMid = coordinates[Math.floor(coordinates.length / 2)] as [number, number]
        route.locationEnd = coordinates[coordinates.length - 1] as [number, number]
    }

    return route
}

/**
 * Return activity icon (emoji) based on its type.
 * @param source The relevant Strava activity or club event.
 */
export function getSportIcon(source: StravaActivity | StravaClubEvent): string {
    const activity = source as StravaActivity

    switch (activity.sportType) {
        case "GravelRide":
        case "MountainBikeRide":
            return "🚵"
    }

    switch (source.type) {
        case "Run":
        case "VirtualRun":
            return "🏃"
        case "Walk":
            return "🚶"
        case "Ride":
        case "EBikeRide":
        case "VirtualRide":
            return "🚴"
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
        case "Hike":
            return "🥾"
        default:
            return "👤"
    }
}

/**
 * Process the activity and add the necessary suffixes (if needed) to its fields.
 * @param user The user owning the activity.
 * @param activity The Strava activity to be transformed.
 */
export const transformActivityFields = (user: UserData, activity: StravaActivity): void => {
    const noSuffixes = user.preferences?.noSuffixes || false

    for (let prop of recipePropertyList) {
        let suffix = user.profile.units == "imperial" && prop.impSuffix ? prop.impSuffix : prop.suffix

        // Farenheit temperature suffix (special case).
        if (prop.fSuffix && user.preferences.weatherUnit == "f") {
            suffix = prop.fSuffix
        }

        // Make sure times are set using the correct format, depending on the suffix.
        if (prop.type == "time") {
            if (_.isNumber(activity[prop.value])) {
                const aDuration = dayjs.duration(activity[prop.value], "seconds")

                if (prop.suffix == "m" && activity[prop.value] < 3600) {
                    activity[prop.value] = aDuration.format("mm:ss")
                } else if (prop.suffix == "h") {
                    activity[prop.value] = aDuration.format("HH:mm")
                } else {
                    activity[prop.value] = aDuration.format("HH:mm:ss")
                    suffix = "h"
                }
            } else if (_.isDate(activity[prop.value])) {
                const aDate = dayjs.utc(activity[prop.value]).add(activity.utcStartOffset, "minutes")
                const format = prop.value.substring(0, 4) == "date" ? "L HH:mm" : "HH:mm"
                activity[prop.value] = aDate.format(format)
            }
        }

        // Sport type separated by spaces.
        else if (prop.value == "sportType") {
            activity.sportType = activity.sportType.replace(/([A-Z])/g, " $1").trim() as any
        }

        // Append suffixes.
        if (suffix && !noSuffixes && !_.isNil(activity[prop.value]) && !_.isDate(activity[prop.value])) {
            activity[prop.value] = `${activity[prop.value]}${suffix}`
        }
    }

    // Replace gear object with the gear name.
    if (activity.gear && activity.gear.name) {
        activity.gear = activity.gear.name as any
    }
}
