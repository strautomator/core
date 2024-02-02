// Strautomator Core: Recipe Action methods

import {RecipeAction, RecipeActionType, RecipeData, RecipeMusicTags, RecipeStatsData} from "./types"
import {recipeActionList} from "./lists"
import {transformActivityFields} from "../strava/utils"
import {StravaActivity, StravaGear, StravaSport} from "../strava/types"
import {UserData} from "../users/types"
import {ActivityWeather} from "../weather/types"
import {axiosRequest} from "../axios"
import recipeStats from "./stats"
import ai from "../ai"
import garmin from "../garmin"
import maps from "../maps"
import musixmatch from "../musixmatch"
import notifications from "../notifications"
import spotify from "../spotify"
import weather from "../weather"
import dayjs from "../dayjs"
import _ from "lodash"
import jaul from "jaul"
import logger from "anyhow"
import * as logHelper from "../loghelper"
const settings = require("setmeup").settings

/**
 * Random funny quotes.
 */
export const fortuneCookies: string[] = [
    "Sometimes when I close my eyes, I can't see.",
    "He who laughs last didn't get it.",
    "I put my phone in airplane mode, but it's not flying!",
    "I'm not lazy, I'm just very relaxed.",
    "Roses are red, my name is not Dave, this makes no sense, microwave.",
    "Yesterday I did nothing and today I'm finishing what I did yesterday.",
    "Doing nothing is hard, you never know when you're done.",
    "If I’m not back in five minutes, just wait longer.",
    "Why do they call it rush hour when nothing moves?",
    "Get your facts first, then you can distort them as you please.",
    "What's another word for Thesaurus?",
    "I can resist everything except temptation.",
    "Weather forecast for tonight: dark.",
    "Cure for an obsession: get another one.",
    "One advantage of talking to yourself is that you know at least somebody's listening.",
    "It never gets easier, you just go faster.",
    "Beyond pain there is a whole universe of more pain.",
    "You never have the wind with you - either it's against you or you’re having a good day.",
    "It is the unknown around the corner that turns my wheels.",
    "I’d like to help you out. Which way did you come in?",
    "I doubt, therefore I might be.",
    "Constipated people don’t give a crap.",
    "All generalizations are false.",
    "Hello world!",
    "I tried to set my password to 'beef stew' but it wasn't stroganoff.",
    "A brilliant idea will come to you in the shower. Just don't forget the shampoo.",
    "Warning: The fortune you seek is in another cookie. Keep eating.",
    "Your luckiest number is 404. Don't worry, it's just hiding from you.",
    "You will discover the true meaning of procrastination... tomorrow.",
    "There is a difference between knowing the path and riding the path.",
    "Bad spellers of the world untie!",
    "Confidence is 10% hard work and 90% delusion.",
    "Life is too short for traffic.",
    "I'm still an atheist, thank God.",
    "Getting there isn't half the fun - it's all the fun.",
    "Do or do not. There is no try.",
    "Two wrongs don't make a right, but they make a good excuse."
]

/**
 * Helper to log and alert users about failed actions.
 */
const failedAction = async (user: UserData, activity: StravaActivity, recipe: RecipeData, action: RecipeAction, error: any): Promise<void> => {
    logger.error("Recipes.failedAction", logHelper.user(user), logHelper.activity(activity), `${recipe.id} - ${action.type}`, error)

    try {
        const errorMessage = error.message || error.description || error
        const actionType = _.find(recipeActionList, {value: action.type}).text
        const actionValue = action.friendlyValue || action.value
        const body = `There was an issue processing the activity ID ${activity.id}. Action: ${actionType} - ${actionValue}. ${errorMessage.toString()}`
        const title = `Failed automation: ${recipe.title}`

        // Create a notification to the user stating the failed action.
        const notification = {userId: user.id, title: title, body: body, recipeId: recipe.id, activityId: activity.id}
        await notifications.createNotification(user, notification)
    } catch (ex) {
        logger.error("Recipes.failedAction.exception", logHelper.user(user), logHelper.activity(activity), `${recipe.id} - ${action.type}`, ex)
    }
}

/**
 * Default action to change an activity's property (name or description).
 * @param user The activity owner.
 * @param activity The Strava activity details.
 * @param recipe The source recipe.
 * @param action The action details.
 */
export const defaultAction = async (user: UserData, activity: StravaActivity, recipe: RecipeData, action: RecipeAction): Promise<boolean> => {
    try {
        let processedValue = action.value || ""
        let activityWithSuffix: StravaActivity = _.cloneDeep(activity)

        // Pre-process activity data and append suffixes to values before processing.
        transformActivityFields(user, activityWithSuffix)

        // City tag(s) set? Trigger a reverse geocode for the specified coordinates, at the moment PRO users only.
        const hasCityStart = processedValue.includes("${cityStart}")
        const hasCityMid = processedValue.includes("${cityMid}")
        const hasCityEnd = processedValue.includes("${cityEnd}")
        if (user.isPro && (hasCityStart || hasCityMid || hasCityEnd)) {
            const cityObj = {cityStart: "", cityMid: "", cityEnd: ""}

            if (activity.hasLocation) {
                if (hasCityStart) {
                    try {
                        const address = await maps.getReverseGeocode(activity.locationStart, "locationiq")
                        if (!address || !address.city) throw new Error(`Failed to geocode: ${activity.locationStart.join(", ")}`)
                        cityObj.cityStart = address.city
                    } catch (innerEx) {
                        logger.warn("Recipes.defaultAction", logHelper.user(user), logHelper.activity(activity), recipe.id, "cityStart", innerEx)
                    }
                }
                if (hasCityMid) {
                    try {
                        const address = await maps.getReverseGeocode(activity.locationMid, "locationiq")
                        if (!address || !address.city) throw new Error(`Failed to geocode: ${activity.locationMid.join(", ")}`)
                        cityObj.cityMid = address.city
                    } catch (innerEx) {
                        logger.warn("Recipes.defaultAction", logHelper.user(user), logHelper.activity(activity), recipe.id, "cityMid", innerEx)
                    }
                }
                if (hasCityEnd) {
                    try {
                        const address = await maps.getReverseGeocode(activity.locationEnd, "locationiq")
                        if (!address || !address.city) throw new Error(`Failed to geocode: ${activity.locationEnd.join(", ")}`)
                        cityObj.cityEnd = address.city
                    } catch (innerEx) {
                        logger.warn("Recipes.defaultAction", logHelper.user(user), logHelper.activity(activity), recipe.id, "cityEnd", innerEx)
                    }
                }
            }

            processedValue = jaul.data.replaceTags(processedValue, {cityStart: cityObj.cityStart, hasCityMid: cityObj.cityMid, cityEnd: cityObj.cityEnd})
        }

        // Value has a counter tag? Get recipe stats to increment the counter.
        // Do not increment if it identifies that the automation has already ran previously.
        if (processedValue.includes("${counter}")) {
            const stats: RecipeStatsData = (await recipeStats.getStats(user, recipe)) as RecipeStatsData
            const currentCounter = stats?.counter || 0
            const addCounter = !stats || !stats.activities.includes(activity.id) ? 1 : 0
            activityWithSuffix.counter = currentCounter + addCounter
        }

        // Weather tags on the value? Fetch weather and process it, but only if activity has a location set.
        if (processedValue.includes("${weather.")) {
            processedValue = await addWeatherTags(user, activity, recipe, processedValue)
        }

        // Music tags on the value? Fetch from Spotify if the user has an account linked.
        if (processedValue.includes("${spotify.")) {
            processedValue = await addSpotifyTags(user, activity, recipe, processedValue)
        }

        // Garmin tags on the value? Get those from the Garmin activity.
        if (processedValue.includes("${garmin.")) {
            processedValue = await addGarminTags(user, activity, recipe, processedValue)
        }

        // Replace tags.
        if (processedValue) {
            processedValue = jaul.data.replaceTags(processedValue, activityWithSuffix)
        }

        // Empty value? Stop here.
        if (processedValue === null || processedValue.toString().trim() === "") {
            logger.warn("Recipes.defaultAction", logHelper.user(user), logHelper.activity(activity), "Processed action value is empty")
            return true
        }

        // Set the activity name?
        if (action.type == RecipeActionType.Name) {
            activity.name = processedValue
            activity.updatedFields.push("name")
        }
        // Prepend to the activity name?
        else if (action.type == RecipeActionType.PrependName) {
            activity.name = `${processedValue} ${activity.name}`
            activity.updatedFields.push("name")
        }
        // Append to the activity name?
        else if (action.type == RecipeActionType.AppendName) {
            activity.name = `${activity.name} ${processedValue}`
            activity.updatedFields.push("name")
        }
        // Set the activity description?
        else if (action.type == RecipeActionType.Description) {
            activity.description = processedValue
            activity.updatedFields.push("description")
        }
        // Prepend to the activity description?
        else if (action.type == RecipeActionType.PrependDescription) {
            if (!activity.description) activity.description = processedValue
            else activity.description = `${processedValue} ${activity.description}`

            activity.updatedFields.push("description")
        }
        // Append to the activity description?
        else if (action.type == RecipeActionType.AppendDescription) {
            if (!activity.description) activity.description = processedValue
            else activity.description = `${activity.description} ${processedValue}`

            activity.updatedFields.push("description")
        }
        // Set the activity's private note?
        else if (action.type == RecipeActionType.PrivateNote) {
            activity.privateNote = processedValue
            activity.updatedFields.push("privateNote")
        }

        return true
    } catch (ex) {
        failedAction(user, activity, recipe, action, ex)
        return false
    }
}

/**
 * Default action to add weather tags to the activity name or description.
 * @param user The activity owner.
 * @param activity The Strava activity details.
 * @param recipe The source recipe.
 * @param processedValue The action's processed value.
 */
export const addWeatherTags = async (user: UserData, activity: StravaActivity, recipe: RecipeData, processedValue: string): Promise<string> => {
    try {
        const aqiNeeded = processedValue.includes("${weather.") && processedValue.includes(".aqi")
        const weatherSummary = await weather.getActivityWeather(user, activity, aqiNeeded)

        if (!weatherSummary) {
            logger.warn("Recipes.addWeatherTags", logHelper.user(user), logHelper.activity(activity), logHelper.recipe(recipe), "Got no valid activity weather")
            processedValue = jaul.data.replaceTags(processedValue, "", "weather.start.")
            processedValue = jaul.data.replaceTags(processedValue, "", "weather.end.")
            processedValue = jaul.data.replaceTags(processedValue, "", "weather.")
            return processedValue
        }

        // Weather specific at the start.
        if (processedValue.includes("${weather.start.")) {
            processedValue = jaul.data.replaceTags(processedValue, weatherSummary.start || "", "weather.start.")
        }

        // Weather specific at the end.
        if (processedValue.includes("${weather.end.")) {
            processedValue = jaul.data.replaceTags(processedValue, weatherSummary.end || "", "weather.end.")
        }

        // More time during the day or during the night?
        if (processedValue.includes("${weather.")) {
            processedValue = jaul.data.replaceTags(processedValue, weatherSummary.mid || weatherSummary.end || weatherSummary.end || "", "weather.")
        }
    } catch (ex) {
        logger.warn("Recipes.addWeatherTags", logHelper.user(user), logHelper.activity(activity), logHelper.recipe(recipe), ex)
    }

    return processedValue
}

/**
 * Default action to add music tags to the activity name or description.
 * @param user The activity owner.
 * @param activity The Strava activity details.
 * @param recipe The source recipe.
 * @param processedValue The action's processed value.
 */
export const addSpotifyTags = async (user: UserData, activity: StravaActivity, recipe: RecipeData, processedValue: string): Promise<string> => {
    try {
        const tracks = await spotify.getActivityTracks(user, activity)

        if (!tracks || tracks.length == 0) {
            logger.warn("Recipes.addSpotifyTags", logHelper.user(user), logHelper.activity(activity), logHelper.recipe(recipe), "No Spotify tracks returned for the activity")
            processedValue = jaul.data.replaceTags(processedValue, "", "spotify.")
            return processedValue
        }

        const musicTags: RecipeMusicTags = {
            trackStart: tracks[0].title,
            trackEnd: tracks[tracks.length - 1].title,
            trackList: tracks.map((t) => t.title).join("\n") + "\n#spotify"
        }

        // Add lyrics (only available to PRO users).
        if (user.isPro) {
            if (processedValue.includes("spotify.lyricsStart")) {
                musicTags.lyricsStart = await musixmatch.getLyrics(tracks[0])
            }
            if (processedValue.includes("spotify.lyricsEnd")) {
                musicTags.lyricsEnd = await musixmatch.getLyrics(tracks[tracks.length - 1])
            }
        }

        processedValue = jaul.data.replaceTags(processedValue, musicTags, "spotify.")
    } catch (ex) {
        logger.warn("Recipes.addSpotifyTags", logHelper.user(user), logHelper.activity(activity), logHelper.recipe(recipe), ex)
    }

    return processedValue
}

/**
 * Default action to add Garmin tags to the activity name or description.
 * @param user The activity owner.
 * @param activity The Strava activity details.
 * @param recipe The source recipe.
 * @param processedValue The action's processed value.
 */
export const addGarminTags = async (user: UserData, activity: StravaActivity, recipe: RecipeData, processedValue: string): Promise<string> => {
    try {
        let garminActivity = await garmin.activities.getMatchingActivity(user, activity)
        if (!garminActivity) {
            if (activity.device.includes("Garmin")) {
                await jaul.io.sleep(settings.garmin.delaySeconds)
                garminActivity = await garmin.activities.getMatchingActivity(user, activity)
            }
            if (!garminActivity) {
                logger.warn("Recipes.addGarminTags", logHelper.user(user), logHelper.activity(activity), logHelper.recipe(recipe), "Could not find a matching Garmin activity")
                return processedValue
            }
        }

        processedValue = jaul.data.replaceTags(processedValue, garminActivity, "garmin.")
    } catch (ex) {
        logger.warn("Recipes.addGarminTags", logHelper.user(user), logHelper.activity(activity), logHelper.recipe(recipe), ex)
    }

    return processedValue
}

/**
 * Set a boolean property on the activity.
 * @param user The activity owner.
 * @param activity The Strava activity details.
 * @param recipe The source recipe.
 * @param action The action details.
 * @param field Field to be updated on the activity.
 */
export const booleanAction = async (user: UserData, activity: StravaActivity, recipe: RecipeData, action: RecipeAction): Promise<boolean> => {
    try {
        activity[action.type] = action.value === false ? false : true
        activity.updatedFields.push(action.type)

        return true
    } catch (ex) {
        failedAction(user, activity, recipe, action, ex)
        return false
    }
}

/**
 * Set the activity map style.
 * @param user The activity owner.
 * @param activity The Strava activity details.
 * @param recipe The source recipe.
 * @param action The action details.
 */
export const mapStyleAction = async (user: UserData, activity: StravaActivity, recipe: RecipeData, action: RecipeAction): Promise<boolean> => {
    try {
        activity.mapStyle = action.value
        activity.updatedFields.push("mapStyle")

        return true
    } catch (ex) {
        failedAction(user, activity, recipe, action, ex)
        return false
    }
}

/**
 * Set an activity's gear.
 * @param user The activity owner.
 * @param activity The Strava activity details.
 * @param recipe The source recipe.
 * @param action The action details.
 */
export const gearAction = async (user: UserData, activity: StravaActivity, recipe: RecipeData, action: RecipeAction): Promise<boolean> => {
    try {
        const isRide = activity.sportType.includes("Ride")
        const isRun = activity.sportType.includes("Run") || activity.sportType == "Walk" || activity.sportType == "Hike"
        const bike = _.find(user.profile.bikes, {id: action.value})
        const shoe = _.find(user.profile.shoes, {id: action.value})
        const none: StravaGear = action.value === "none" ? {id: "none", name: "None"} : null
        const gear: StravaGear = bike || shoe || none

        // Make sure gear is valid for the correct activity type.
        if (!gear) {
            throw new Error(`Gear ID ${action.value} not found`)
        } else if ((isRide && shoe) || (isRun && bike)) {
            logger.info("Recipes.gearAction", logHelper.user(user), logHelper.activity(activity), logHelper.recipe(recipe), `Gear ${action.value} not valid for type ${activity.sportType}`)
        } else {
            activity.gear = gear
            activity.updatedFields.push("gear")
        }

        return true
    } catch (ex) {
        failedAction(user, activity, recipe, action, ex)
        return false
    }
}

/**
 * Set the activity / sport type.
 * @param user The activity owner.
 * @param activity The Strava activity details.
 * @param recipe The source recipe.
 * @param action The action details.
 */
export const sportTypeAction = async (user: UserData, activity: StravaActivity, recipe: RecipeData, action: RecipeAction): Promise<boolean> => {
    try {
        const activityType = action.value
        activity.type = activityType
        activity.sportType = activityType
        activity.updatedFields.push("sportType")

        return true
    } catch (ex) {
        failedAction(user, activity, recipe, action, ex)
        return false
    }
}

/**
 * Set the activity workout type.
 * @param user The activity owner.
 * @param activity The Strava activity details.
 * @param recipe The source recipe.
 * @param action The action details.
 */
export const workoutTypeAction = async (user: UserData, activity: StravaActivity, recipe: RecipeData, action: RecipeAction): Promise<boolean> => {
    try {
        const isRide = activity.type == "Ride"
        const isRun = activity.type == "Run"
        let abortMessage: string

        // Avoid setting ride workout types to runs, and vice versa.
        if (!isRide && !isRun) {
            abortMessage = `Activity is not a ride or run, won't set workout type to ${action.value}`
        } else if (isRide && action.value < 10) {
            abortMessage = `Activity is not a ride, won't set workout type to ${action.value}`
        } else if (isRun && action.value >= 10) {
            abortMessage = `Activity is not a run, won't set workout type to ${action.value}`
        }

        if (abortMessage) {
            logger.info("Recipes.workoutTypeAction", logHelper.user(user), logHelper.activity(activity), logHelper.recipe(recipe), abortMessage)
        } else {
            activity.workoutType = action.value
            activity.updatedFields.push("workoutType")
        }

        return true
    } catch (ex) {
        failedAction(user, activity, recipe, action, ex)
        return false
    }
}

/**
 * Gets a random activity name or description using AI or using pre-defined templates.
 * @param user The user.
 * @param activity The Strava activity.
 * @param recipe The source recipe, optional.
 * @param action The action details, optional.
 */
export const aiGenerateAction = async (user: UserData, activity: StravaActivity, recipe?: RecipeData, action?: RecipeAction): Promise<boolean> => {
    try {
        const now = dayjs.utc()
        let humour = action ? action.value : _.sample(settings.ai.humours)

        // Stop here if the activity already has an AI generated name or description.
        if (action.type == RecipeActionType.GenerateName && activity.aiName) {
            logger.info("Recipes.aiGenerateAction", logHelper.user(user), logHelper.activity(activity), logHelper.recipe(recipe), "Using previously AI generated name")
            return true
        } else if (action.type == RecipeActionType.GenerateDescription && activity.aiDescription) {
            logger.info("Recipes.aiGenerateAction", logHelper.user(user), logHelper.activity(activity), logHelper.recipe(recipe), "Using previously AI generated description")
            return true
        }

        // Weather based checks for activities that happened in the last 3 days.
        const weatherUnit = user.preferences ? user.preferences.weatherUnit : null
        const isRecent = now.subtract(3, "days").isBefore(activity.dateEnd)
        const rndWeather = user.isPro ? settings.plans.pro.generatedNames.weather : settings.plans.free.generatedNames.weather
        let weatherSummaries: ActivityWeather
        if (activity.hasLocation && isRecent && Math.random() * 100 <= rndWeather) {
            const language = user.preferences.language

            // Force English language, fetch weather summaries for activity,
            // then reset the user language back to its default.
            user.preferences.language = "en"
            try {
                weatherSummaries = await weather.getActivityWeather(user, activity, true)
            } catch (weatherEx) {
                logger.warn("Recipes.aiGenerateAction", logHelper.user(user), logHelper.activity(activity), logHelper.recipe(recipe), "Failed to get the activity weather summary")
            }
            user.preferences.language = language
        }

        // Decide if we should use AI or fallback to template-based names.
        // User with privacy mode enabled, and activities processed in batch mode are excluded.
        const rndAi = user.isPro ? settings.plans.pro.generatedNames.ai : activity.batch ? -1 : settings.plans.free.generatedNames.ai
        if (!user.preferences.privacyMode && Math.random() * 100 <= rndAi) {
            if (action.type == RecipeActionType.GenerateName) {
                const aiResponse = await ai.generateActivityName(user, {activity, humour, weatherSummaries})
                if (aiResponse) {
                    activity.aiName = true
                    activity.name = aiResponse.response
                    activity.updatedFields.push("name")
                    return true
                }
            } else if (action.type == RecipeActionType.GenerateDescription) {
                const aiResponse = await ai.generateActivityDescription(user, {activity, humour, weatherSummaries})
                if (aiResponse) {
                    activity.aiDescription = true
                    activity.description = aiResponse.response
                    activity.updatedFields.push("description")
                    return true
                }
            }

            logger.warn("Recipes.aiGenerateAction", logHelper.user(user), logHelper.activity(activity), logHelper.recipe(recipe), "AI failed, fallback to template")
        }

        const imperial = user.profile.units == "imperial"
        const isRide = activity.sportType == StravaSport.Ride || activity.sportType == StravaSport.VirtualRide || activity.sportType == StravaSport.EBikeRide
        const isRun = activity.sportType == StravaSport.Run || activity.sportType == StravaSport.Walk

        // Rounded activity properties.
        const distanceR = Math.round(activity.distance)
        const speedAvgR = Math.round(activity.speedAvg)
        const elevationGainR = Math.round(activity.elevationGain)

        // Default prefixes.
        let prefixes = ["", "delightful", "amazing", "great", "", "just your regular", "crazy", "superb", "", "magnificent", "marvellous", "exotic", ""]
        let names = []
        let uniqueNames = []
        let seqCount = 0

        // Virtual ride prefix.
        if (activity.sportType == StravaSport.VirtualRide) {
            prefixes.push("virtual:")
            prefixes.unshift("virtual:")
        }
        if (activity.trainer) {
            prefixes.push("pain cave:")
            prefixes.push("turbo trainer:")
            prefixes.unshift("indoor:")
        }

        // Cycling.
        if (isRide) {
            if (activity.distance >= 400) {
                if (["boring"].includes(humour)) {
                    uniqueNames.push("just a very, very long ride")
                }
                if (["ancient", "exquisite"].includes(humour)) {
                    uniqueNames.push("transcontinental feelings")
                }
                if (["comical", "hilarious", "silly"].includes(humour)) {
                    uniqueNames.push("almost a lap around the world")
                }
                if (["funny", "hilarious", "ironic", "sarcastic", "silly"].includes(humour)) {
                    uniqueNames.push("short and easy tour")
                }
            } else if (activity.distance >= 200 && activity.distance <= 220) {
                if (["boring"].includes(humour)) {
                    names.push("double century tour")
                    names.push("double century ride")
                } else {
                    names.push("century x2")
                }
            } else if (activity.distance >= 100 && activity.distance <= 110) {
                if (["boring"].includes(humour)) {
                    names.push("century ride")
                    names.push("century tour")
                } else {
                    names.push("century tour")
                }
            } else if (activity.distance > 98 && activity.distance < 100) {
                names.push("almost-a-century ride")
                names.push("and so close to 3 digits")
            } else if ((imperial && distanceR == 26) || distanceR == 42) {
                uniqueNames.push("marathon on two wheels")
                uniqueNames.push("marathon on a bike")
            } else if (((imperial && activity.distance < 6) || activity.distance <= 10) && activity.distance > 0) {
                if (["ancient", "boring"].includes(humour)) {
                    names.push("and short, too short of a ride")
                    names.push("short, very short ride")
                    names.push("mini ride")
                }
                if (["comical", "funny", "hilarious", "ironic", "sarcastic", "silly"].includes(humour)) {
                    uniqueNames.push("training for the Tour de France")
                }
            }

            if ((imperial && activity.speedAvg > 26) || activity.speedAvg > 42) {
                if (["ancient", "boring"].includes(humour)) {
                    uniqueNames.push("lightspeed")
                    uniqueNames.push("push push push")
                }
                if (["comical", "funny", "hilarious", "ironic", "sarcastic", "silly"].includes(humour)) {
                    uniqueNames.push("recovery ride")
                }
                if (["comical", "funny", "sexy", "wicked"].includes(humour)) {
                    uniqueNames.push("shut up legs")
                }
            } else if (((imperial && activity.speedAvg < 5) || activity.speedAvg < 8) && activity.speedAvg > 0) {
                if (["ancient", "boring"].includes(humour)) {
                    uniqueNames.push("slow does it")
                }
                if (["comical", "funny", "hilarious"].includes(humour)) {
                    uniqueNames.push("who's in a hurry?")
                }
                if (["ironic", "sarcastic", "silly"].includes(humour)) {
                    uniqueNames.push("training for La Vuelta")
                }
            }

            if (activity.wattsMax > 1600 || activity.wattsAvg > 400) {
                if (["ancient"].includes(humour)) {
                    uniqueNames.push("much horsepower")
                }
                if (["boring"].includes(humour)) {
                    uniqueNames.push("legs are pumping hard")
                }
                if (["comical", "funny"].includes(humour)) {
                    uniqueNames.push("rocket propelled")
                }
                if (["comical", "funny", "sexy", "wicked"].includes(humour)) {
                    uniqueNames.push("shut up legs")
                }
            } else if (activity.wattsAvg < 80 && activity.wattsAvg > 0) {
                if (["ancient"].includes(humour)) {
                    uniqueNames.push("no horsepower")
                }
                if (["ancient", "boring"].includes(humour)) {
                    uniqueNames.push("smooth")
                }
                if (["boring", "silly"].includes(humour)) {
                    uniqueNames.push("easy does it")
                    uniqueNames.push("soft pedaling")
                }
                if (["ironic", "sarcastic", "silly"].includes(humour)) {
                    uniqueNames.push("training for the Giro")
                }
            }

            if (activity.distance > 0 && activity.elevationGain > 0 && activity.climbingRatio < 0.15) {
                if (["boring"].includes(humour)) {
                    names.push("flatland tour")
                }
                if (["ironic", "sarcastic", "silly"].includes(humour)) {
                    names.push("ride along some massive hills")
                }
            }
        }

        // Running.
        else if (isRun) {
            if ((imperial && activity.distance >= 52) || activity.distance >= 84) {
                if (["ancient", "boring", "silly"].includes(humour)) {
                    uniqueNames.push("when a marathon is not enough")
                }
                if (["boring"].includes(humour)) {
                    uniqueNames.push("double marathon")
                }
                if (["ironic", "sarcastic", "silly"].includes(humour)) {
                    uniqueNames.push("walk in the park")
                }
            } else if ((imperial && activity.distance >= 26) || activity.distance >= 42) {
                if (["ancient", "boring", "silly"].includes(humour)) {
                    names.push("marathon")
                }
                if (["ironic", "sarcastic", "silly"].includes(humour)) {
                    uniqueNames.push("walk in the park")
                }
                if (["sexy"].includes(humour)) {
                    uniqueNames.push("all the legs out")
                }
            } else if (distanceR == 10) {
                names.push("10K")
                names.push("10K or 6 miles?")
            } else if (((imperial && activity.distance < 2.5) || activity.distance < 4) && activity.distance > 0) {
                if (["ancient", "boring", "silly"].includes(humour)) {
                    names.push("super short run")
                    names.push("mini workout")
                }
                if (["ironic", "sarcastic", "silly"].includes(humour)) {
                    names.push("training for the marathon")
                }
            }
        }

        // High elevation gain.
        if ((!imperial && activity.elevationGain > 6000) || activity.elevationGain > 19500) {
            uniqueNames.push("everesting")
            uniqueNames.push("the sky is the limit")
            uniqueNames.push("don’t buy upgrades, ride up grades")
            uniqueNames.push("don’t upgrade, go up grades")
        } else if ((!imperial && activity.elevationGain > 2000) || activity.elevationGain > 6500) {
            names.push("roller coaster")
            names.push("tour with lots of elevation")
        }

        // Ultra long or short workouts.
        if (activity.movingTime > 43200) {
            uniqueNames.push("a long, long day")
            uniqueNames.push("short tour around the block")
            uniqueNames.push("keep going, never stop")
        } else if (activity.movingTime > 28800) {
            names.push("many-hours tour")
            names.push("short tour around the block")
        } else if (activity.distance < 2 && activity.distance > 0) {
            uniqueNames.push("now that was quick")
            uniqueNames.push("training for the IRONMAN")
            uniqueNames.push("training for the TdF")
        }

        // Lots of calories.
        if (activity.calories > 6000) {
            uniqueNames.push("a week's worth of calories")
            uniqueNames.push("energy galore")
        } else if (activity.calories > 4000) {
            names.push("caloric extermination")
            names.push("caloric workout")
        }

        // High heart rate.
        if (activity.hrMax > 210 || activity.hrAvg > 170) {
            uniqueNames.push("heart stress test")
            uniqueNames.push("cardiovascular festival")
        }

        // High cadence.
        if (activity.cadenceAvg > 120) {
            uniqueNames.push("the knitting machine")
            uniqueNames.push("RPM")
        }
        if (activity.cadenceAvg > 100) {
            names.push("knitting machine")
        }

        // Matching properties.
        if (distanceR == speedAvgR) {
            uniqueNames.push(`${distanceR} / ${speedAvgR}`)
        }

        // Sequencing.
        if (distanceR == 123 || activity.wattsAvg == 123 || activity.relativeEffort == 123 || activity.hrAvg == 123) {
            uniqueNames.push("one two three")
        } else if (distanceR == 321 || activity.wattsAvg == 321 || activity.relativeEffort == 321) {
            uniqueNames.push("three two one")
        }

        for (let value of [distanceR, elevationGainR, activity.wattsAvg, activity.wattsMax, activity.relativeEffort, activity.hrAvg]) {
            const aValue = value ? value.toString() : ""
            if (aValue.length > 2 && /^(.)\1+$/.test(aValue)) {
                seqCount++
            }
        }
        if (seqCount > 2) {
            uniqueNames.push("royal straight flush")
        } else if (seqCount > 1) {
            names.push("straight flush")
        }

        // Commutes.
        if (activity.commute) {
            if (names.length > 0) {
                prefixes.push("commute:")
                prefixes.unshift("yet another commute:")
            } else {
                names.push("commute")
            }
        }

        // Got the activity weather summary? Add a few
        if (weatherSummaries) {
            let wPrefixes: string[] = []

            // Check for weather on start and end of the activity.
            for (let summary of [weatherSummaries.start, weatherSummaries.end]) {
                if (!summary) continue

                const temperature = parseFloat(summary.temperature.toString().replace(/[^\d.-]/g, ""))
                const precipitation = summary.precipitation ? summary.precipitation.toLowerCase() : ""
                const random = Math.random()

                if ((weatherUnit == "f" && temperature < 23) || temperature < -5) {
                    uniqueNames.push("ice age")
                    uniqueNames.push("frostbite festival")
                    uniqueNames.push("feels like summer")
                } else if ((weatherUnit == "f" && temperature > 95) || temperature > 35) {
                    uniqueNames.push("melting")
                    uniqueNames.push("outdoor sauna")
                    uniqueNames.push("doesn't feel warm, at all")
                } else if ((weatherUnit == "f" && temperature < 33) || temperature < 1) {
                    wPrefixes.push(random > 0.5 ? "freezing" : "icy")
                } else if ((weatherUnit == "f" && temperature < 51) || temperature < 11) {
                    wPrefixes.push(random > 0.5 ? "chilly" : "cold")
                } else if ((weatherUnit == "f" && temperature > 86) || temperature > 30) {
                    wPrefixes.push(random > 0.5 ? "tropical" : "hot")
                } else if ((weatherUnit == "f" && temperature > 68) || temperature > 20) {
                    wPrefixes.push(random > 0.5 ? "warm" : "cozy")
                }

                if (precipitation.includes("snow")) {
                    wPrefixes.push(random > 0.5 ? "snowy" : "snow-powdered")
                } else if (precipitation.includes("rain") || precipitation.includes("drizzle")) {
                    wPrefixes.push(random > 0.5 ? "raining" : "wet")
                }
            }

            // Weather prefixes were set? Append them to the original prefixes.
            if (wPrefixes.length > 0) {
                prefixes = prefixes.map((p) => `${_.sample(wPrefixes)} ${p}`)
            }
        }

        // No unique names or names? Maybe just use the basic stuff, around 10% chances.
        if (uniqueNames.length == 0 && names.length == 0 && Math.random() < 0.1) {
            if (isRide) {
                names.push("ride")
                names.push("tour")
                names.push("bike ride")
                names.push("bike tour")
            } else if (isRun) {
                names.push("run")
                names.push("jog")
            } else {
                names.push("workout")
            }
        }

        // Build resulting string.
        // If unique names were set, use one with a 90% chance.
        // If regular names were set, use it with a 70% chance.
        // Everything else, use a funny quote.
        let result: string
        if (uniqueNames.length > 0 && Math.random() < 0.9) {
            result = _.sample(uniqueNames)
        } else if (names.length > 0 && Math.random() < 0.7) {
            result = `${_.sample(prefixes)} ${_.sample(names)}`.trim()
        }

        result = result ? result.charAt(0).toUpperCase() + result.slice(1) : _.sample(fortuneCookies)

        if (action.type == RecipeActionType.GenerateName) {
            activity.name = result
            activity.updatedFields.push("name")
        } else if (action.type == RecipeActionType.GenerateDescription) {
            activity.description = result
            activity.updatedFields.push("description")
        }

        return true
    } catch (ex) {
        failedAction(user, activity, recipe, action, ex)
        return false
    }
}

/**
 * Dispatch activity and data via a webhook URL.
 * @param user The activity owner.
 * @param activity The Strava activity details.
 * @param recipe The source recipe.
 * @param action The action details.
 */
export const webhookAction = async (user: UserData, activity: StravaActivity, recipe: RecipeData, action: RecipeAction): Promise<boolean> => {
    try {
        const options = {
            method: "POST",
            url: action.value,
            timeout: settings.recipes.webhook.timeout,
            data: activity
        }

        await axiosRequest(options)
        return true
    } catch (ex) {
        failedAction(user, activity, recipe, action, ex)
        return false
    }
}
