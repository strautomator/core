// Strautomator Core: Strava Utils

import {StravaActivity, StravaActivityPerformance, StravaActivityToProcess, StravaClub, StravaClubEvent, StravaGear, StravaLap, StravaProfile, StravaProfileStats, StravaRideType, StravaRoute, StravaRunType, StravaSport, StravaTotals} from "./types"
import {UserData} from "../users/types"
import {recipePropertyList} from "../recipes/lists"
import {translation} from "../translations"
import maps from "../maps"
import routes from "../routes"
import dayjs from "../dayjs"
import _ from "lodash"
import logger from "anyhow"
import polyline = require("@mapbox/polyline")
import * as logHelper from "../loghelper"
const settings = require("setmeup").settings

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
    const utcOffset = data.utc_offset ? data.utc_offset / 60 : 0
    const startDate = dayjs.utc(data.start_date)
    const localStartDate = startDate.utcOffset(utcOffset)

    const activity: StravaActivity = {
        id: data.id,
        type: data.type || data.sport_type,
        sportType: data.sport_type || data.type,
        workoutType: data.workout_type && data.workout_type != 0 && data.workout_type != 10 ? data.workout_type : null,
        name: data.name,
        flagged: data.flagged ? true : false,
        private: data.private ? true : false,
        commute: data.commute ? true : false,
        hideHome: data.hide_from_home ? true : false,
        trainer: data.trainer ? true : false,
        dateStart: startDate.toDate(),
        dateEnd: data.elapsed_time ? startDate.add(data.elapsed_time, "s").toDate() : null,
        weekday: localStartDate.locale(user.preferences.language || "en").format("dddd"),
        weekOfYear: localStartDate.week(),
        utcStartOffset: utcOffset,
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
        hasCadence: data.average_cadence > 0,
        cadenceAvg: Math.round(data.average_cadence) || null,
        cadenceSpm: data.average_cadence ? Math.round(data.average_cadence * 2) : null,
        calories: data.calories || null,
        relativeEffort: data.suffer_score || null,
        perceivedExertion: data.perceived_exertion || null,
        device: data.device_name || null,
        manual: data.manual,
        athleteCount: data.athlete_count || 1,
        hasPhotos: data.photos && data.photos.count > 0 ? true : false,
        privateNote: data.private_note || null,
        updatedFields: []
    }

    // Week of year should consider the firstDayOfWeek preference.
    if (user.preferences.firstDayOfWeek == "monday" && activity.weekOfYear > 0 && localStartDate.day() === 0) {
        activity.weekOfYear -= 1
    }

    // Has a description?
    if (data.description) {
        activity.description = data.description
    }

    // Tagged as a workout or race?
    if (activity.workoutType == StravaRideType.Workout || activity.workoutType == StravaRunType.Workout) {
        activity.workout = true
    } else if (activity.workoutType == StravaRideType.Race || activity.workoutType == StravaRunType.Race) {
        activity.race = true
    }

    // Has an external ID?
    if (data.external_id) {
        activity.externalId = data.external_id
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
    if (data.map) {
        activity.polyline = data.map.polyline

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
    }

    // Has location data?
    activity.hasLocation = activity.locationStart?.length > 0 || activity.locationEnd?.length > 0

    // Get country from start, mid and end locations.
    if (activity.locationStart?.length > 0) {
        activity.countryStart = maps.getCountryCode(activity.locationStart)
        activity.countryFlagStart = maps.getCountryFlag(activity.locationStart)
    }
    if (activity.locationMid?.length > 0) {
        activity.countryMid = maps.getCountryCode(activity.locationMid)
        activity.countryFlagMid = maps.getCountryFlag(activity.locationMid)
    }
    if (activity.locationEnd?.length > 0) {
        activity.countryEnd = maps.getCountryCode(activity.locationEnd)
        activity.countryFlagEnd = maps.getCountryFlag(activity.locationEnd)
    }

    if (data.stats_visibility && data.stats_visibility.length > 0) {
        for (let sv of data.stats_visibility) {
            if (sv.type == "pace") activity.hideStatPace = sv.visibility == "only_me"
            else if (sv.type == "speed") activity.hideStatSpeed = sv.visibility == "only_me"
            else if (sv.type == "calories") activity.hideStatCalories = sv.visibility == "only_me"
            else if (sv.type == "heart_rate") activity.hideStatHeartRate = sv.visibility == "only_me"
            else if (sv.type == "power") activity.hideStatPower = sv.visibility == "only_me"
            else if (sv.type == "start_time") activity.hideStatStartTime = sv.visibility == "only_me"
        }
    }

    // Set activity gear.
    const gearId = data.gear && data.gear.id ? data.gear.id : data.gear_id
    if (gearId) {
        activity.gear = activity.gear = _.find(profile.bikes, {id: gearId}) || _.find(profile.shoes, {id: gearId})
    } else if (data.gear) {
        activity.gear = toStravaGear(profile, data.gear.id)
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
        activity.distanceMeters = parseInt(data.distance)
        activity.distance = parseFloat(distance.toFixed(1))
        activity.distanceUnit = user.profile.units == "imperial" ? "mi" : "km"
        activity.co2Saved = parseFloat((data.distance * 0.00021743).toFixed(2))
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

    // Activity laps.
    const laps: StravaLap[] = data.laps && data.laps.length > 0 ? [] : null
    if (laps) {
        for (let lap of data.laps) {
            laps.push({
                distance: parseFloat(((lap.distance / 1000) * distanceMultiplier).toFixed(1)),
                speed: parseFloat((lap.average_speed * 3.6 * distanceMultiplier).toFixed(1)),
                totalTime: lap.elapsed_time,
                movingTime: lap.moving_time || lap.elapsed_time
            })
        }

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

    // Check for completed segment efforts
    // (includes segments/counts and new PRs and KOMs).
    if (data.segment_efforts?.length > 0) {
        activity.segments = data.segment_efforts.map((r) => r.segment.id.toString())

        for (const segmentEffort of data.segment_efforts) {
            const segmentId = segmentEffort.segment.id
            const currentCount = activity.segmentCounts?.[segmentId] || 0
            const newCount = currentCount + 1
            activity.segmentCounts = {
                ...activity.segmentCounts,
                [segmentId]: newCount
            }
        }

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

    // Remove nulls before returning the activity data.
    return _.omitBy(activity, (v) => v === null) as StravaActivity
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
        units: data.measurement_preference == "feet" ? "imperial" : "metric",
        ftp: data.ftp || null,
        weight: data.weight || null,
        bikes: [],
        shoes: []
    }

    // Set profile dates.
    if (data.created_at) {
        profile.dateCreated = dayjs.utc(data.created_at).toDate()
    }
    if (data.updated_at) {
        profile.dateUpdated = dayjs.utc(data.updated_at).toDate()
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

    // Sex defined?
    if (data.sex) {
        profile.sex = data.sex
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
    if (data.route?.id_str) {
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
        sportType: data.type == 1 ? StravaSport.Ride : StravaSport.Run,
        url: `https://strava.com/routes/${data.id_str}`
    }

    // Set correct sport type.
    if (data.sub_type) {
        if (data.type == 1) {
            if (data.sub_type == 2) route.sportType = StravaSport.MountainBikeRide
            else if (data.sub_type == 3) route.sportType = StravaSport.GravelRide
        } else {
            if (data.sub_type == 4) route.sportType = StravaSport.TrailRun
        }
    }

    // Estimated moving time available? Also estimate the total time.
    if (data.estimated_moving_time) {
        route.movingTime = data.estimated_moving_time
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

    // Process additional route details.
    routes.process(user, route)

    return route
}

/**
 * Helper to get the formatted cadence depending on the sport type (credits: @izackwu).
 * @param cadence The cadence value.
 * @param sportType The sport type.
 */
export const getCadenceString = (cadence: number, sportType: StravaSport): string => {
    if (!cadence || !sportType) return "not available"
    const isRide = sportType?.includes("Ride")
    const isRun = sportType?.includes("Run")
    if (!isRide && !isRun) return "not available"
    return isRide ? `${cadence} RPM` : `${cadence * 2} SPM`
}

/**
 * Calculates the best 5, 20 and 60min power splits.
 * @param watts Watts data points.
 */
export const calculatePowerIntervals = (watts: number[]): StravaActivityPerformance => {
    const result: StravaActivityPerformance = {}
    const intervals: StravaActivityPerformance = {
        power5min: 300,
        power20min: 1200,
        power60min: 3600
    }

    // Iterate intervals and then the watts data points to get the
    // highest sum for each interval. This could be improved in the
    // future to iterate the array only once and get the intervals
    // all in a single pass.
    for (let [key, interval] of Object.entries(intervals)) {
        if (watts.length < interval) {
            continue
        }

        let best = 0

        for (let i = 0; i < watts.length - interval; i++) {
            const sum = _.sum(watts.slice(i, i + interval))

            if (sum > best) {
                best = sum
            }
        }

        result[key] = Math.round(best / interval)
    }

    return result
}

/**
 * Return activity icon (emoji) based on its type.
 * @param source The relevant Strava activity or club event.
 */
export function getSportIcon(source: StravaActivity | StravaClubEvent): string {
    const sportType = source["type"] || source["sportType"]

    switch (sportType) {
        case "Ride":
            return "🚴"
        case "GravelRide":
            return "🚵‍♂️"
        case "MountainBikeRide":
            return "🚵"
        case "EMountainBikeRide":
            return "🚵‍♀️"
        case "EBikeRide":
            return "🚴‍♀️"
        case "VirtualRide":
        case "Handcycle":
        case "Velomobile":
            return "🚲"
        case "Run":
            return "🏃‍♂️"
        case "TrailRun":
            return "🏃"
        case "VirtualRun":
            return "👟"
        case "Walk":
            return "🚶"
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
        case "Kayaking":
            return "🛶"
        case "Rowing":
            return "🚣"
        case "VirtualRow":
            return "🚣🏽‍♂️"
        case "Sail":
            return "⛵"
        case "Golf":
            return "🏌"
        case "Soccer":
            return "⚽"
        case "Crossfit":
            return "🏋🏻‍♀️"
        case "Elliptical":
        case "WeightTraining":
            return "🏋"
        case "HighIntensityIntervalTraining":
            return "🏋️‍♂️"
        case "Yoga":
            return "🧘"
        case "Pilates":
            return "🧘🏻‍♀️"
        case "Wheelchair":
            return "🧑‍🦽"
        case "Hike":
            return "🥾"
        case "Badminton":
            return "🏸"
        case "Tennis":
        case "Squash":
            return "🎾"
        case "TableTennis":
        case "Racquetball":
            return "🏓"
        case "Pickleball":
            return "🏏"
        default:
            return "🚶🏽"
    }
}

/**
 * Process the activity and add the necessary suffixes (if needed) to its fields.
 * @param user The user owning the activity.
 * @param activity The Strava activity to be transformed.
 * @param noSuffixes Do not append suffixes to the processed values.
 */
export const transformActivityFields = (user: UserData, activity: StravaActivityToProcess, noSuffixes?: boolean): void => {
    noSuffixes = noSuffixes || user.preferences.noSuffixes || false

    for (let prop of recipePropertyList) {
        let suffix = user.profile.units == "imperial" && prop.impSuffix ? prop.impSuffix : prop.suffix

        // Fahrenheit temperature suffix (special case).
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
                activity[prop.value] = aDate.locale(user.preferences.language || "en").format(format)
            }
        }

        // Append suffixes. If suffix has at least 3 characters, check for translations as well.
        if (suffix && !noSuffixes && !_.isNil(activity[prop.value]) && !_.isDate(activity[prop.value])) {
            if (suffix.length >= 3) {
                suffix = translation(suffix, user.preferences)
            }
            activity[prop.value] = `${activity[prop.value]} ${suffix}`
        }
    }

    // Sport type separated by spaces.
    if (activity.sportType) {
        activity.sportType = translation(`SportTypes.${activity.sportType}`, user.preferences) as any
    }

    // Replace gear object with the gear name.
    if (activity.gear && activity.gear.name) {
        activity.gear = activity.gear.name as any
    }

    // Garmin and Wahoo splits should have a summary string as splitsText.
    if (activity.garmin || activity.wahoo) {
        const splitsText = (splits: any[]) => {
            const summaries = splits.map((s) => {
                const splitType = s.splitType || "Split"
                delete s.splitType
                const props = Object.entries(s)
                const propValueMerge = (e) => {
                    e[0] = e[0].replace(/([A-Z])/g, " $1").toLowerCase()
                    return e.join(" = ")
                }
                const propValues = props.map((e) => propValueMerge(e)).join(", ")
                return `${splitType}: ${propValues}`
            })
            return summaries.join("\n")
        }
        if (activity.garmin?.splits?.length > 0) {
            activity.garmin.splitsText = splitsText(activity.garmin.splits)
        }
        if (activity.wahoo?.splits?.length > 0) {
            activity.wahoo.splitsText = splitsText(activity.wahoo.splits)
        }
    }

    // Replace activity null values with an empty string.
    const keys = Object.keys(activity)
    for (let key of keys) {
        if (_.isNil(activity[key])) {
            activity[key] = ""
        }
    }
}

/**
 * Check if the Strava activity has a tag to prevent it from being processed.
 * @param user The user owning the activity.
 * @param activity The Strava activity to be transformed.
 * @param context The context in which the activity is being ignored.
 */
export const isActivityIgnored = (user: UserData, activity: StravaActivity, context: "automation" | "gear" | "ftp"): boolean => {
    if (!user || !activity) {
        return false
    }

    const baseHashtag = settings.strava.processedActivities.ignoreHashtag
    const hashtag = `${baseHashtag}-${context}`

    if (activity.name?.includes(baseHashtag) || activity.name?.includes(hashtag)) {
        logger.warn("Strava.ignoreActivity", logHelper.user(user), logHelper.activity(activity), `Ignored via hashtag (${context})`)
        return true
    }

    return false
}
