"use strict";
// Strautomator Core: Strava types
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Helper to transform data from the API to a StravaActivity interface.
 * @param data Input data.
 */
function toStravaActivity(data) {
    const activity = {
        id: data.id,
        type: data.type,
        name: data.name,
        description: data.description,
        commute: data.commute,
        dateStart: data.start_date_local,
        dateEnd: data.start_date_local + data.elapsed_time,
        distance: data.distance,
        elevationGain: data.total_elevation_gain,
        elevationMax: data.elev_high,
        totalTime: data.elapsed_time,
        movingTime: data.moving_time,
        locationStart: data.start_latlng,
        locationEnd: data.end_latlng,
        sufferScore: data.suffer_score,
        speedAvg: data.average_speed,
        speedMax: data.max_speed,
        wattsAvg: data.average_watts,
        wattsWeighted: data.weighted_average_watts,
        cadenceAvg: data.average_cadence,
        temperature: data.average_temp,
        device: data.device_name,
        updatedFields: []
    };
    if (data.gear) {
        activity.gear = toStravaGear(data.gear);
    }
    return activity;
}
exports.toStravaActivity = toStravaActivity;
/**
 * Helper to transform data from the API to a StravaGear interface.
 * @param data Input data.
 */
function toStravaGear(data) {
    const gear = {
        id: data.id,
        name: data.name || data.description,
        primary: data.primary
    };
    return gear;
}
exports.toStravaGear = toStravaGear;
/**
 * Helper to transform data from the API to a StravaProfile interface.
 * @param data Input data.
 */
function toStravaProfile(data) {
    const profile = {
        id: data.id.toString(),
        username: data.username,
        firstName: data.firstname,
        lastName: data.lastname,
        dateCreated: data.created_at,
        dateUpdated: data.updated_at,
        bikes: [],
        shoes: []
    };
    // Has bikes?
    if (data.bikes && data.bikes.length > 0) {
        for (let bike of data.bikes) {
            profile.bikes.push(toStravaGear(bike));
        }
    }
    // Has shoes?
    if (data.shoes && data.shoes.length > 0) {
        for (let shoe of data.shoes) {
            profile.shoes.push(toStravaGear(shoe));
        }
    }
    // Has profile image?
    if (data.profile) {
        profile.urlAvatar = data.profile;
    }
    return profile;
}
exports.toStravaProfile = toStravaProfile;
/**
 * Strava sport types.
 */
var StravaSport;
(function (StravaSport) {
    StravaSport["Ride"] = "Ride";
    StravaSport["Run"] = "Run";
})(StravaSport = exports.StravaSport || (exports.StravaSport = {}));
