// Strautomator Core: Recipe Action methods

import {RecipeAction, RecipeActionType, RecipeData, RecipeMusicTags, RecipeStatsData} from "./types"
import {recipeActionList} from "./lists"
import {GearWearComponent, GearWearConfig} from "../gearwear/types"
import {transformActivityFields} from "../strava/utils"
import {StravaActivity, StravaGear, StravaSport} from "../strava/types"
import {UserData} from "../users/types"
import {ActivityWeather} from "../weather/types"
import {AxiosConfig, axiosRequest} from "../axios"
import recipeStats from "./stats"
import ai from "../ai"
import fitparser from "../fitparser"
import gearwear from "../gearwear"
import maps from "../maps"
import musixmatch from "../musixmatch"
import notifications from "../notifications"
import spotify from "../spotify"
import strava from "../strava"
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
 * Dad jokes.
 */
export const dadJokes: string[] = [
    "I went to the aquarium this weekend, but I didn’t stay long. There’s something fishy about that place.",
    "What do you call a sheep who can sing and dance? Lady Ba Ba.",
    "Why can't dinosaurs clap their hands? Because they're extinct.",
    "Who won the neck decorating contest? It was a tie.",
    "Dogs can't operate MRI machines. But catscan.",
    "What did the skillet eat on its birthday? Pan-cakes.",
    "What do you call a dog who meditates? Aware wolf.",
    "What kind of fish do penguins catch at night? Star fish.",
    "Which vegetable has the best kung fu? Broc-lee.",
    "Why don't skeletons fight each other? They don't have the guts.",
    "What do you call fake spaghetti? An impasta.",
    "Why did the bicycle fall over? Because it was two-tired.",
    "What do you call cheese that isn't yours? Nacho cheese.",
    "Why can't you give Elsa a balloon? Because she will let it go.",
    "Why did the golfer bring two pairs of pants? In case he got a hole in one.",
    "Why don't some couples go to the gym? Because some relationships don't work out.",
    "Why was the stadium so cool? It was filled with fans.",
    "Why did the tomato turn red? Because it saw the salad dressing.",
    "Why don't scientists trust atoms? Because they make up everything.",
    "Why did the coffee file a police report? It got mugged.",
    "Why did the cookie go to the hospital? Because it felt crummy.",
    "Why don't programmers like nature? It has too many bugs.",
    "Why did the computer go to the doctor? Because it had a virus.",
    "Why did the belt go to jail? Because it held up a pair of pants.",
    "Why did the picture go to jail? Because it was framed.",
    "Why did the bicycle stand up by itself? It was two-tired.",
    "Why did the computer go to the doctor? Because it had a virus.",
    "Why did the chicken join a band? Because it had the drumsticks.",
    "Why did the picture go to jail? Because it was framed.",
    "Why did the scarecrow win an award? Because he was outstanding in his field.",
    "Why did the math book look sad? Because it had too many problems."
]

/**
 * Helper to log and alert users about failed actions.
 */
const failedAction = async (user: UserData, activity: StravaActivity, recipe: RecipeData, action: RecipeAction, error: any): Promise<void> => {
    const logDetails = [`${recipe.id} - ${action.type}: ${action.friendlyValue || action.value}`]
    if (error.statusCode) {
        logDetails.push(`Status ${error.statusCode}`)
    }

    logger.error("Recipes.failedAction", logHelper.user(user), logHelper.activity(activity), logDetails, error)

    try {
        const errorMessage = error.message || error.description || error.toString()
        const actionType = _.find(recipeActionList, {value: action.type}).text
        const actionValue = action.friendlyValue || action.value
        const body = `There was an issue processing the activity ID ${activity.id}. Action: ${actionType} - ${actionValue}. ${errorMessage.toString()}`
        const title = `Failed automation: ${recipe.title}`

        // Create a notification to the user stating the failed action.
        const notification = {userId: user.id, title: title, body: body, recipeId: recipe.id, activityId: activity.id}
        await notifications.createNotification(user, notification)
    } catch (ex) {
        logger.error("Recipes.failedAction.exception", logHelper.user(user), logHelper.activity(activity), logDetails, ex)
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
        let processedValue = (action.value || "").toString()
        let activityWithSuffix: StravaActivity = _.cloneDeep(activity)

        // Pre-process activity data and append suffixes to values before processing.
        transformActivityFields(user, activityWithSuffix)

        // Replace main tags.
        if (processedValue) {
            processedValue = jaul.data.replaceTags(processedValue, activityWithSuffix)
        }

        // City tag(s) set? Trigger a reverse geocode for the specified coordinates.
        const hasCityStart = processedValue.includes("${cityStart}")
        const hasCityMid = processedValue.includes("${cityMid}")
        const hasCityEnd = processedValue.includes("${cityEnd}")
        if (hasCityStart || hasCityMid || hasCityEnd) {
            const cityObj = {cityStart: "", cityMid: "", cityEnd: ""}

            // Reverse geocode using LocationIQ. If it fails and user os PRO, fallback to Google.
            if (activity.hasLocation) {
                if (hasCityStart) {
                    try {
                        let address = await maps.getReverseGeocode(activity.locationStart, "locationiq")
                        if ((!address || !address.city) && user.isPro) {
                            address = await maps.getReverseGeocode(activity.locationStart, "google")
                        }
                        if (!address || !address.city) {
                            throw new Error(`Failed to geocode: ${activity.locationStart.join(", ")}`)
                        }
                        cityObj.cityStart = address.city
                    } catch (innerEx) {
                        logger.warn("Recipes.defaultAction", logHelper.user(user), logHelper.activity(activity), recipe.id, "cityStart", innerEx)
                    }
                }
                if (hasCityMid) {
                    try {
                        let address = await maps.getReverseGeocode(activity.locationMid || activity.locationEnd, "locationiq")
                        if ((!address || !address.city) && user.isPro) {
                            address = await maps.getReverseGeocode(activity.locationMid || activity.locationEnd, "google")
                        }
                        if (!address || !address.city) {
                            throw new Error(`Failed to geocode: ${activity.locationMid.join(", ")}`)
                        }
                        cityObj.cityMid = address.city
                    } catch (innerEx) {
                        logger.warn("Recipes.defaultAction", logHelper.user(user), logHelper.activity(activity), recipe.id, "cityMid", innerEx)
                    }
                }
                if (hasCityEnd) {
                    try {
                        let address = await maps.getReverseGeocode(activity.locationEnd, "locationiq")
                        if ((!address || !address.city) && user.isPro) {
                            address = await maps.getReverseGeocode(activity.locationEnd, "google")
                        }
                        if (!address || !address.city) {
                            throw new Error(`Failed to geocode: ${activity.locationEnd.join(", ")}`)
                        }
                        cityObj.cityEnd = address.city
                    } catch (innerEx) {
                        logger.warn("Recipes.defaultAction", logHelper.user(user), logHelper.activity(activity), recipe.id, "cityEnd", innerEx)
                    }
                }
            }

            processedValue = jaul.data.replaceTags(processedValue, {cityStart: cityObj.cityStart, hasCityMid: cityObj.cityMid, cityEnd: cityObj.cityEnd})
        }

        // Value has a counter tag? Get recipe stats to increment it.
        // Do not increment if it identifies that the automation has executed before.
        const hasCounter = processedValue.includes("${counter}")
        if (hasCounter) {
            const stats: RecipeStatsData = (await recipeStats.getStats(user, recipe)) as RecipeStatsData
            const currentCounter = stats?.counter || 0
            const addCounter = stats?.activities.includes(activity.id) ? 0 : recipe.counterProp && activity[recipe.counterProp] ? activity[recipe.counterProp] : 1
            activity.counter = activityWithSuffix.counter = currentCounter + addCounter
        }

        // Weather tags on the value? Fetch weather and process it, but only if activity has a location set.
        if (processedValue.includes("${weather.")) {
            processedValue = await addWeatherTags(user, activity, recipe, processedValue)
        }

        // Music tags on the value? Fetch from Spotify if the user has an account linked.
        if (processedValue.includes("${spotify.")) {
            processedValue = await addSpotifyTags(user, activity, recipe, processedValue)
        }

        // Garmin tags on the value? Get those from the corresponding FIT file activity.
        if (processedValue.includes("${garmin.")) {
            processedValue = await addGarminTags(user, activity, recipe, processedValue)
        }

        // Wahoo tags on the value? Get those from the corresponding FIT file activity.
        if (processedValue.includes("${wahoo.")) {
            processedValue = await addWahooTags(user, activity, recipe, processedValue)
        }

        // Replace remaining tags with an empty string.
        if (processedValue) {
            processedValue = jaul.data.replaceTags(processedValue, activityWithSuffix, null, true)
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
        // Set the activity private note?
        else if (action.type == RecipeActionType.PrivateNote) {
            activity.privateNote = processedValue
            activity.updatedFields.push("privateNote")
        }
        // Prepend to the activity private note?
        else if (action.type == RecipeActionType.PrependPrivateNote) {
            if (!activity.privateNote) activity.privateNote = processedValue
            else activity.privateNote = `${processedValue} ${activity.privateNote}`
            activity.updatedFields.push("privateNote")
        }
        // Append to the activity private note?
        else if (action.type == RecipeActionType.AppendPrivateNote) {
            if (!activity.privateNote) activity.privateNote = processedValue
            else activity.privateNote = `${activity.privateNote} ${processedValue}`
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
    const debugLogger = user.debug ? logger.warn : logger.debug

    if (!user.spotify) {
        debugLogger("Recipes.addSpotifyTags", logHelper.user(user), logHelper.activity(activity), logHelper.recipe(recipe), "User has no Spotify profile linked, will skip")
        return processedValue
    }

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
 * Default action to add Garmin tags to the activity name or description. Available to PRO users only.
 * @param user The activity owner.
 * @param activity The Strava activity details.
 * @param recipe The source recipe.
 * @param processedValue The action's processed value.
 */
export const addGarminTags = async (user: UserData, activity: StravaActivity, recipe: RecipeData, processedValue: string): Promise<string> => {
    const debugLogger = user.debug ? logger.warn : logger.debug

    if (!user.isPro) {
        debugLogger("Recipes.addGarminTags", logHelper.user(user), logHelper.activity(activity), logHelper.recipe(recipe), "User is not PRO, will skip")
        return processedValue
    }
    if (!user.garmin) {
        debugLogger("Recipes.addGarminTags", logHelper.user(user), logHelper.activity(activity), logHelper.recipe(recipe), "User has no Garmin profile linked, will skip")
        return processedValue
    }

    try {
        let garminActivity = await fitparser.getMatchingActivity(user, activity, "garmin")
        if (!garminActivity) {
            logger.warn("Recipes.addGarminTags", logHelper.user(user), logHelper.activity(activity), logHelper.recipe(recipe), "Could not find a matching Garmin activity")
            return processedValue
        }

        processedValue = jaul.data.replaceTags(processedValue, garminActivity, "garmin.")
    } catch (ex) {
        logger.warn("Recipes.addGarminTags", logHelper.user(user), logHelper.activity(activity), logHelper.recipe(recipe), ex)
    }

    return processedValue
}

/**
 * Default action to add Wahoo tags to the activity name or description. Available to PRO users only.
 * @param user The activity owner.
 * @param activity The Strava activity details.
 * @param recipe The source recipe.
 * @param processedValue The action's processed value.
 */
export const addWahooTags = async (user: UserData, activity: StravaActivity, recipe: RecipeData, processedValue: string): Promise<string> => {
    const debugLogger = user.debug ? logger.warn : logger.debug

    if (!user.isPro) {
        debugLogger("Recipes.addWahooTags", logHelper.user(user), logHelper.activity(activity), logHelper.recipe(recipe), "User is not PRO, will skip")
        return processedValue
    }
    if (!user.wahoo) {
        debugLogger("Recipes.addWahooTags", logHelper.user(user), logHelper.activity(activity), logHelper.recipe(recipe), "User has no Wahoo profile linked, will skip")
        return processedValue
    }

    try {
        let wahooActivity = await fitparser.getMatchingActivity(user, activity, "wahoo")
        if (!wahooActivity) {
            logger.warn("Recipes.addWahooTags", logHelper.user(user), logHelper.activity(activity), logHelper.recipe(recipe), "Could not find a matching Wahoo activity")
            return processedValue
        }

        processedValue = jaul.data.replaceTags(processedValue, wahooActivity, "wahoo.")
    } catch (ex) {
        logger.warn("Recipes.addWahooTags", logHelper.user(user), logHelper.activity(activity), logHelper.recipe(recipe), ex)
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
 * The action value can represent the AI provider or the humour to be used.
 * @param user The user.
 * @param activity The Strava activity.
 * @param recipe The source recipe, optional.
 * @param action The action details, optional.
 */
export const aiGenerateAction = async (user: UserData, activity: StravaActivity, recipe?: RecipeData, action?: RecipeAction): Promise<boolean> => {
    try {
        const now = dayjs.utc()
        const actionValue = action?.value || null
        const provider = ["anthropic", "gemini", "openai", "xai"].includes(actionValue) ? actionValue : null
        const humourPrompt = !provider && actionValue ? actionValue : _.sample(settings.ai.humours)

        // Stop here if the activity already has an AI generated name or description.
        if (action.type == RecipeActionType.GenerateName && activity.aiNameProvider) {
            logger.info("Recipes.aiGenerateAction", logHelper.user(user), logHelper.activity(activity), logHelper.recipe(recipe), `Using cached AI generated name by ${activity.aiDescriptionProvider}`)
            return true
        } else if (action.type == RecipeActionType.GenerateDescription && activity.aiDescriptionProvider) {
            logger.info("Recipes.aiGenerateAction", logHelper.user(user), logHelper.activity(activity), logHelper.recipe(recipe), `Using cached AI generated description by ${activity.aiDescriptionProvider}`)
            return true
        } else if (action.type == RecipeActionType.GenerateInsights && activity.aiInsightsProvider) {
            logger.info("Recipes.aiGenerateAction", logHelper.user(user), logHelper.activity(activity), logHelper.recipe(recipe), `Using cached AI generated insights by ${activity.aiInsightsProvider}`)
            return true
        }

        // Weather is included only on recent activities.
        let activityWeather: ActivityWeather
        const isRecent = now.subtract(7, "days").isBefore(activity.dateEnd)
        const rndWeather = user.isPro ? settings.plans.pro.generatedNames.weather : settings.plans.free.generatedNames.weather
        if (activity.hasLocation && isRecent && Math.random() * 100 <= rndWeather) {
            const language = user.preferences.language

            // Force English language, fetch weather summaries for activity,
            // then reset the user language back to its default.
            user.preferences.language = "en"
            try {
                activityWeather = await weather.getActivityWeather(user, activity, true)
            } catch (weatherEx) {
                logger.warn("Recipes.aiGenerateAction", logHelper.user(user), logHelper.activity(activity), logHelper.recipe(recipe), "Failed to get the activity weather summary")
            }
            user.preferences.language = language
        }

        // Decide if we should use AI or fallback to template-based names.
        // User with privacy mode enabled, and free users activities processed in batch mode, are excluded.
        let rndAi = user.isPro ? settings.plans.pro.generatedNames.ai : settings.plans.free.generatedNames.ai
        if (activity.batch) {
            rndAi -= settings.plans.free.generatedNames.ai
        } else if (action.type == RecipeActionType.GenerateInsights) {
            rndAi = user.isPro ? 100 : 0
        }
        if (!user.preferences.privacyMode && Math.random() * 100 <= rndAi) {
            if (action.type == RecipeActionType.GenerateName) {
                const aiResponse = await ai.generateActivityName(user, {activity, humourPrompt, provider, activityWeather, fullDetails: user.isPro})
                if (aiResponse) {
                    activity.aiNameProvider = aiResponse.provider
                    activity.aiName = activity.name = aiResponse.response as string
                    activity.updatedFields.push("name")
                    return true
                }
            } else if (action.type == RecipeActionType.GenerateDescription) {
                const aiResponse = await ai.generateActivityDescription(user, {activity, humourPrompt, provider, activityWeather, fullDetails: user.isPro})
                if (aiResponse) {
                    activity.aiDescriptionProvider = aiResponse.provider
                    activity.aiDescription = activity.description = aiResponse.response as string
                    activity.updatedFields.push("description")
                    return true
                }
            } else if (action.type == RecipeActionType.GenerateInsights && user.isPro) {
                const fromDate = now.subtract(settings.ai.insights.recentWeeks, "weeks").toDate()
                const toDate = dayjs(activity.dateStart).subtract(1, "minute").toDate()
                const recentActivities = await strava.activityProcessing.getProcessedActivities(user, fromDate, toDate)
                const aiResponse = await ai.generateActivityInsights(user, {activity, humourPrompt, provider, activityWeather, recentActivities, fullDetails: true})
                if (aiResponse) {
                    activity.aiInsightsProvider = aiResponse.provider
                    activity.aiInsights = activity.privateNote = aiResponse.response as string
                    activity.updatedFields.push("privateNote")
                    return true
                } else {
                    return false
                }
            }

            logger.warn("Recipes.aiGenerateAction", logHelper.user(user), logHelper.activity(activity), logHelper.recipe(recipe), "AI failed, fallback to template")
        }

        if (action.type == RecipeActionType.GenerateInsights) {
            return false
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
                if (["boring"].includes(humourPrompt)) {
                    uniqueNames.push("just a very, very long ride")
                }
                if (["ancient", "exquisite"].includes(humourPrompt)) {
                    uniqueNames.push("transcontinental feelings")
                }
                if (["comical", "hilarious", "silly"].includes(humourPrompt)) {
                    uniqueNames.push("almost a lap around the world")
                }
                if (["funny", "hilarious", "ironic", "sarcastic", "silly"].includes(humourPrompt)) {
                    uniqueNames.push("short and easy tour")
                }
            } else if (activity.distance >= 200 && activity.distance <= 220) {
                if (["boring"].includes(humourPrompt)) {
                    names.push("double century tour")
                    names.push("double century ride")
                } else {
                    names.push("century x2")
                }
            } else if (activity.distance >= 100 && activity.distance <= 110) {
                if (["boring"].includes(humourPrompt)) {
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
                if (["ancient", "boring"].includes(humourPrompt)) {
                    names.push("and short, too short of a ride")
                    names.push("short, very short ride")
                    names.push("mini ride")
                }
                if (["comical", "funny", "hilarious", "ironic", "sarcastic", "silly"].includes(humourPrompt)) {
                    uniqueNames.push("training for the Tour de France")
                }
            }

            if ((imperial && activity.speedAvg > 26) || activity.speedAvg > 42) {
                if (["ancient", "boring"].includes(humourPrompt)) {
                    uniqueNames.push("lightspeed")
                    uniqueNames.push("push push push")
                }
                if (["comical", "funny", "hilarious", "ironic", "sarcastic", "silly"].includes(humourPrompt)) {
                    uniqueNames.push("recovery ride")
                }
                if (["comical", "funny", "sexy", "wicked"].includes(humourPrompt)) {
                    uniqueNames.push("shut up legs")
                }
            } else if (((imperial && activity.speedAvg < 5) || activity.speedAvg < 8) && activity.speedAvg > 0) {
                if (["ancient", "boring"].includes(humourPrompt)) {
                    uniqueNames.push("slow does it")
                }
                if (["comical", "funny", "hilarious"].includes(humourPrompt)) {
                    uniqueNames.push("who's in a hurry?")
                }
                if (["ironic", "sarcastic", "silly"].includes(humourPrompt)) {
                    uniqueNames.push("training for La Vuelta")
                }
            }

            if (activity.wattsMax > 1600 || activity.wattsAvg > 400) {
                if (["ancient"].includes(humourPrompt)) {
                    uniqueNames.push("much horsepower")
                }
                if (["boring"].includes(humourPrompt)) {
                    uniqueNames.push("legs are pumping hard")
                }
                if (["comical", "funny"].includes(humourPrompt)) {
                    uniqueNames.push("rocket propelled")
                }
                if (["comical", "funny", "sexy", "wicked"].includes(humourPrompt)) {
                    uniqueNames.push("shut up legs")
                }
            } else if (activity.wattsAvg < 80 && activity.wattsAvg > 0) {
                if (["ancient"].includes(humourPrompt)) {
                    uniqueNames.push("no horsepower")
                }
                if (["ancient", "boring"].includes(humourPrompt)) {
                    uniqueNames.push("smooth")
                }
                if (["boring", "silly"].includes(humourPrompt)) {
                    uniqueNames.push("easy does it")
                    uniqueNames.push("soft pedaling")
                }
                if (["ironic", "sarcastic", "silly"].includes(humourPrompt)) {
                    uniqueNames.push("training for the Giro")
                }
            }

            if (activity.distance > 0 && activity.elevationGain > 0 && activity.climbingRatio < 0.15) {
                if (["boring"].includes(humourPrompt)) {
                    names.push("flatland tour")
                }
                if (["ironic", "sarcastic", "silly"].includes(humourPrompt)) {
                    names.push("ride along some massive hills")
                }
            }
        }

        // Running.
        else if (isRun) {
            if ((imperial && activity.distance >= 52) || activity.distance >= 84) {
                if (["ancient", "boring", "silly"].includes(humourPrompt)) {
                    uniqueNames.push("when a marathon is not enough")
                }
                if (["boring"].includes(humourPrompt)) {
                    uniqueNames.push("double marathon")
                }
                if (["ironic", "sarcastic", "silly"].includes(humourPrompt)) {
                    uniqueNames.push("walk in the park")
                }
            } else if ((imperial && activity.distance >= 26) || activity.distance >= 42) {
                if (["ancient", "boring", "silly"].includes(humourPrompt)) {
                    names.push("marathon")
                }
                if (["ironic", "sarcastic", "silly"].includes(humourPrompt)) {
                    uniqueNames.push("walk in the park")
                }
                if (["sexy"].includes(humourPrompt)) {
                    uniqueNames.push("all the legs out")
                }
            } else if (distanceR == 10) {
                names.push("10K")
                names.push("10K or 6 miles?")
            } else if (((imperial && activity.distance < 2.5) || activity.distance < 4) && activity.distance > 0) {
                if (["ancient", "boring", "silly"].includes(humourPrompt)) {
                    names.push("super short run")
                    names.push("mini workout")
                }
                if (["ironic", "sarcastic", "silly"].includes(humourPrompt)) {
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
        if (activityWeather) {
            const weatherUnit = user.preferences ? user.preferences.weatherUnit : null
            let wPrefixes: string[] = []

            // Check for weather on start and end of the activity.
            for (let summary of [activityWeather.start, activityWeather.end]) {
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

        result = result ? result.charAt(0).toUpperCase() + result.slice(1) : _.sample(_.concat(fortuneCookies, dadJokes))

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
 * Enable or disable a GearWear component.
 * @param user The activity owner.
 * @param activity The Strava activity details.
 * @param recipe The source recipe.
 * @param actions The GearWear component actions.
 */
export const toggleGearComponents = async (user: UserData, activity: StravaActivity, recipe: RecipeData, actions: RecipeAction[]): Promise<boolean> => {
    try {
        const updatedGear: {[id: string]: {config: GearWearConfig; toggledComponents: GearWearComponent[]}} = {}

        // Iterate over each GearWear based action, and keep the updated stuff in the updatedGear object
        // so we can updated everything at once later on (to avoid possible repeated updates to the same GearWear).
        for (let action of actions) {
            try {
                const arrGear: string[] = action.value.split(":")
                const gearId = arrGear.shift().trim()

                // Make sure the specified gear is still valid.
                const gear: GearWearConfig = updatedGear[gearId]?.config || (await gearwear.getById(gearId))
                if (!gear) {
                    throw new Error(`Gear ${gearId} not found`)
                }

                // Make sure the component exists.
                const componentName = arrGear.join(":").trim()
                const component = gear.components?.find((c) => componentName.toLowerCase() == c.name.trim().toLowerCase())
                if (!component) {
                    throw new Error(`Gear ${gearId}, component "${componentName}" not found`)
                }

                // Enable or disable only if the status has changed.
                const disable = action.type == RecipeActionType.DisableGearComponent
                if (component.disabled != disable) {
                    if (!updatedGear[gearId]) {
                        updatedGear[gearId] = {config: gear, toggledComponents: []}
                    }
                    component.disabled = disable
                    updatedGear[gearId].toggledComponents.push(component)
                }
            } catch (actionEx) {
                failedAction(user, activity, recipe, action, actionEx)
            }
        }

        // Updated the relevant gear components in one go.
        for (let gearId in updatedGear) {
            await gearwear.upsert(user, updatedGear[gearId].config, updatedGear[gearId].toggledComponents)
        }

        return true
    } catch (ex) {
        logger.error("Recipes.actions.toggleGearComponents", logHelper.user(user), logHelper.activity(activity), ex)
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
        const arrValue = action.value.split(" ")
        let targetUrl = arrValue.length > 1 ? arrValue.join(" ") : arrValue[0]
        let method = arrValue[0]

        // Make sure we're using a valid method. If not, defaults to POST.
        if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method)) {
            method = "POST"
            targetUrl = action.value
        }

        const options: AxiosConfig = {
            method: method,
            url: encodeURI(jaul.data.replaceTags(targetUrl, activity)),
            timeout: settings.recipes.webhook.timeout
        }
        if (method != "GET") {
            options.data = activity
        }

        await axiosRequest(options)
        return true
    } catch (ex) {
        failedAction(user, activity, recipe, action, ex)
        return false
    }
}
