// Strautomator Web: Recipe (automation) helpers

import _ from "lodash"

interface RecipeTag {
    value: string
    label: string
    pro?: boolean
}

/**
 * Build the list of activity tags (main and extra) that can be used on recipe actions.
 */
const buildActivityTags = (): {mainActivityTags: RecipeTag[]; extraActivityTags: RecipeTag[]} => {
    // Activity general tags.
    const generalTags: RecipeTag[] = [
        {value: "icon", label: "Activity icon"},
        {value: "name", label: "Activity name"},
        {value: "description", label: "Activity description"},
        {value: "sportType", label: "Sport type"},
        {value: "counter", label: "Counter"},
        {value: "distance", label: "Distance"},
        {value: "speedAvg", label: "Avg speed"},
        {value: "speedMax", label: "Max speed"},
        {value: "paceAvg", label: "Avg pace"},
        {value: "paceMax", label: "Max pace"},
        {value: "cadenceAvg", label: "Avg cadence (RPM)"},
        {value: "cadenceSpm", label: "Avg cadence (SPM)"},
        {value: "elevationGain", label: "Elevation gain"},
        {value: "elevationMax", label: "Max elevation"},
        {value: "climbingRatio", label: "Climbing ratio"},
        {value: "totalTime", label: "Total time"},
        {value: "movingTime", label: "Moving time"},
        {value: "co2Saved", label: "CO2 saved"},
        {value: "weekday", label: "Weekday"},
        {value: "weekOfYear", label: "Week of year"},
        {value: "device", label: "Device"},
        {value: "aiNameProvider", label: "AI provider for activity name"},
        {value: "aiDescriptionProvider", label: "AI provider for activity description"}
    ]

    // Activity performance tags.
    const performanceTags: RecipeTag[] = [
        {value: "wattsAvg", label: "Avg power"},
        {value: "wattsWeighted", label: "Normalized power"},
        {value: "wattsMax", label: "Max power"},
        {value: "wattsKg", label: "Watts / kg"},
        {value: "tss", label: "TSS"},
        {value: "hrAvg", label: "Avg HR"},
        {value: "hrMax", label: "Max HR"},
        {value: "calories", label: "Calories"},
        {value: "relativeEffort", label: "Relative effort"},
        {value: "perceivedExertion", label: "Perceived exertion"}
    ]

    // Garmin tags.
    const garminTags: RecipeTag[] = [
        {value: "garmin.tss", label: "Garmin: TSS"},
        {value: "garmin.trainingLoad", label: "Garmin: Training load"},
        {value: "garmin.aerobicTrainingEffect", label: "Garmin: Aerobic t. effect"},
        {value: "garmin.anaerobicTrainingEffect", label: "Garmin: Anaerobic t. effect"},
        {value: "garmin.pedalTorqueEffect", label: "Garmin: Torque effectiveness"},
        {value: "garmin.pedalSmoothness", label: "Garmin: Pedal smoothness"},
        {value: "garmin.pedalBalance", label: "Garmin: Pedal balance"},
        {value: "garmin.primaryBenefit", label: "Garmin: Primary benefit"},
        {value: "garmin.sportProfile", label: "Garmin: Sport profile"},
        {value: "garmin.workoutName", label: "Garmin: Workout name"},
        {value: "garmin.workoutNotes", label: "Garmin: Workout notes"},
        {value: "garmin.splitsText", label: "Garmin: Split summaries"},
        {value: "garmin.laps.totalTime", label: "Garmin: Active lap times"},
        {value: "garmin.laps.speedAvg", label: "Garmin: Active lap avg speeds"},
        {value: "garmin.laps.distance", label: "Garmin: Active lap distances"},
        {value: "garmin.laps.ascent", label: "Garmin: Active lap ascents"},
        {value: "garmin.laps.descent", label: "Garmin: Active lap descents"},
        {value: "garmin.laps.calories", label: "Garmin: Active lap calories"}
    ]

    // Wahoo tags.
    const wahooTags: RecipeTag[] = [
        {value: "wahoo.tss", label: "Wahoo: TSS"},
        {value: "wahoo.trainingLoad", label: "Wahoo: Training load"},
        {value: "wahoo.pedalBalance", label: "Wahoo: Pedal balance"},
        {value: "wahoo.splitsText", label: "Wahoo: Split summaries"},
        {value: "wahoo.laps.totalTime", label: "Wahoo: Active lap times"},
        {value: "wahoo.laps.speedAvg", label: "Wahoo: Active lap avg speeds"},
        {value: "wahoo.laps.distance", label: "Wahoo: Active lap distances"},
        {value: "wahoo.laps.ascent", label: "Wahoo: Active lap ascents"},
        {value: "wahoo.laps.descent", label: "Wahoo: Active lap descents"},
        {value: "wahoo.laps.calories", label: "Wahoo: Active lap calories"}
    ]

    // Activity lap tags.
    const lapTags: RecipeTag[] = [
        {value: "lapCount", label: "Lap count"},
        {value: "lapDistance", label: "Lap distance"},
        {value: "lapTime", label: "Lap time"}
    ]

    // Activity location tags.
    const locationTags: RecipeTag[] = []
    const locationBaseTags: RecipeTag[] = [
        {value: "country", label: "Country name"},
        {value: "countryFlag", label: "Country flag"},
        {value: "city", label: "City", pro: true}
    ]
    for (let t of locationBaseTags) {
        locationTags.push({
            value: `${t.value}Start`,
            label: `${t.label} (start)`
        })
        locationTags.push({
            value: `${t.value}Mid`,
            label: `${t.label} (mid point)`
        })
        locationTags.push({
            value: `${t.value}End`,
            label: `${t.label} (end)`
        })
    }

    // Music track tags.
    const musicTags: RecipeTag[] = [
        {value: "spotify.trackStart", label: "Spotify: Track title (start)"},
        {value: "spotify.trackEnd", label: "Spotify: Track title (end)", pro: true},
        {value: "spotify.trackList", label: "Spotify: Full track list", pro: true},
        {value: "spotify.lyricsStart", label: "Spotify: Track lyrics (first)", pro: true},
        {value: "spotify.lyricsEnd", label: "Spotify: Track lyrics (last)", pro: true},
        {value: "lastfm.trackStart", label: "Last.fm: Track title (start)"},
        {value: "lastfm.trackList", label: "Last.fm: Full track list", pro: true},
        {value: "lastfm.trackEnd", label: "Last.fm: Track title (end)", pro: true},
        {value: "lastfm.lyricsStart", label: "Last.fm: Track lyrics (first)", pro: true},
        {value: "lastfm.lyricsEnd", label: "Last.fm: Track lyrics (last)", pro: true}
    ]

    // Weather tags.
    const weatherTags: RecipeTag[] = []
    const weatherBaseTags = [
        {value: "icon", label: "Icon"},
        {value: "summary", label: "Summary"},
        {value: "temperature", label: "Temp. (real)"},
        {value: "feelsLike", label: "Temp. (feels like)"},
        {value: "humidity", label: "Humidity"},
        {value: "dewPoint", label: "Dew Point"},
        {value: "pressure", label: "Pressure"},
        {value: "windSpeed", label: "Wind speed"},
        {value: "windGust", label: "Wind gust"},
        {value: "windDirection", label: "Wind direction"},
        {value: "precipitation", label: "Precipitation"},
        {value: "airDensity", label: "Air density"},
        {value: "aqi", label: "AQI (0 to 5)"},
        {value: "aqiIcon", label: "AQI Icon"}
    ]
    for (let t of weatherBaseTags) {
        locationTags.push({
            value: `weather.start.${t.value}`,
            label: `Weather: ${t.label} (start)`
        })
        locationTags.push({
            value: `weather.${t.value}`,
            label: `Weather: ${t.label} (mid point)`
        })
        locationTags.push({
            value: `weather.end.${t.value}`,
            label: `Weather: ${t.label} (end)`
        })
    }

    // Combine main and extra activity tags.
    const mainActivityTags = _.concat(generalTags, performanceTags, lapTags, locationTags)
    for (let t of mainActivityTags) {
        t.value = "{" + t.value + "}"
    }
    const extraActivityTags = _.concat(garminTags, wahooTags, musicTags, weatherTags)
    for (let t of extraActivityTags) {
        t.value = "{" + t.value + "}"
    }

    return {mainActivityTags, extraActivityTags}
}

let activityTags: {mainActivityTags: RecipeTag[]; extraActivityTags: RecipeTag[]} = null

/**
 * Actions that have a boolean value.
 */
const booleanActions = ["generateName", "generateDescription", "generateInsights", "hideHome", "hideStatPace", "hideStatSpeed", "hideStatCalories", "hideStatHeartRate", "hideStatPower", "hideStatStartTime"]

/**
 * Validation rules for recipe conditions and actions.
 */
const recipeRules = {
    required: (value: any) => {
        if (!value || value.toString().trim().length < 1) return `Field is required`
        return true
    },
    number: (value: any) => {
        if (isNaN(value)) return "Invalid number"
        const num = parseFloat(value)
        if (num <= 0) return "Must be higher than zero"
        return true
    },
    anyNumber: (value: any) => {
        if (isNaN(value)) return "Invalid number"
        if (/^-?\d*\.?\d*$/.test(value)) return true
        return "Invalid number"
    },
    date: (value: any) => {
        if (!value || value.length < 5) return "Invalid date"
        if (value.match(/^\d{4}\-(0[1-9]|1[012])\-(0[1-9]|[12][0-9]|3[01])$/)) return true
        if (value.match(/^(0[1-9]|1[012])\-(0[1-9]|[12][0-9]|3[01])$/)) return true
        return "Invalid date format"
    },
    time: (value: any) => {
        if (!value || value.length < 4) return "Invalid time"
        const arrValue = value.split(":")
        if (arrValue.length != 2) return "Invalid time"
        if (isNaN(arrValue[0]) || isNaN(arrValue[1])) return "Invalid time"
        const arrTime = arrValue.map((v) => parseInt(v))
        if (arrTime[0] < 0 || arrTime[0] > 23 || arrTime[1] < 0 || arrTime[1] > 59) return "Invalid time"
        return true
    },
    timer: (value: any) => {
        if (!value || value.length < 4) return "Invalid timer"
        const arrValue = value.split(":")
        if (arrValue.length != 2) return "Invalid timer"
        if (isNaN(arrValue[0]) || isNaN(arrValue[1])) return "Invalid timer"
        const arrTime = arrValue.map((v) => parseInt(v))
        if (arrTime[0] < 0 || arrTime[1] < 0 || arrTime[1] > 59) return "Invalid timer"
        return true
    },
    text: (value: any) => {
        if (value && value.length > 0) return true
        return "Empty text"
    },
    url: (value: any) => {
        if (!value) return "Empty URL"

        let parsed: URL
        try {
            parsed = new URL(value)
        } catch (ex) {
            return "Invalid URL"
        }

        if (parsed.protocol != "http:" && parsed.protocol != "https:") return "Invalid URL"
        if (parsed.username || parsed.password) return "Invalid URL"

        const host = (parsed.hostname || "").replace(/^\[|\]$/g, "").toLowerCase()
        if (!host || host.includes(":") || /^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
            return "Webhook URL must be an external domain"
        }
        if (host == "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".localdomain")) {
            return "Webhook URL must be an external domain"
        }
        if (!host.includes(".") || host.startsWith(".") || host.endsWith(".") || host.includes("..") || !/^[a-z0-9.-]+$/.test(host)) {
            return "Webhook URL must be an external domain"
        }

        return true
    }
}

/**
 * Recipe tags, validation rules and summary helpers.
 */
export const useRecipe = () => {
    const store = useMainStore()
    const api = useApi()
    const router = useRouter()
    const webError = useWebError()

    if (!activityTags) {
        activityTags = buildActivityTags()
    }

    /**
     * Returns an action summary.
     * @param action The recipe action.
     */
    const actionSummary = (action: any): string => {
        const actionObj: any = _.find(store.recipeActions, {value: action.type})
        if (!actionObj) {
            return `Undocumented action: ${action.type} - ${action.value || action.friendlyValue}`
        }

        const actionType = actionObj.text
        const isBoolean = booleanActions.includes(action.type)

        let valueText = action.friendlyValue || action.value
        if (_.isString(valueText)) {
            valueText = valueText.replace(/\n/g, " ↵ ")
        }

        if (isBoolean) {
            return action.value != true ? `${actionType} (${valueText})` : `${actionType}`
        }

        return `${actionType}: ${valueText}`
    }

    /**
     * Returns the text for the specified action.
     * @param action The recipe action.
     */
    const actionText = (action: any): string => (_.find(store.recipeActions, {value: action.type}) as any)?.text

    /**
     * Returns a condition summary.
     * @param condition The recipe condition.
     */
    const conditionSummary = (condition: any): string => {
        const property: any = _.find(store.recipeProperties, {value: condition.property})
        if (!property) {
            return `!!! ERROR !!! Invalid property: ${condition.property}`
        }

        if (!property.operators) {
            return property.text
        }

        const operator: any = _.find(property.operators, {value: condition.operator})
        if (!operator) {
            return `!!! ERROR !!! Invalid condition operator: ${condition.operator}`
        }

        const fieldText = property.text
        const operatorText = operator.text
        let valueText = condition.friendlyValue || condition.value

        const suffix = store.user?.profile?.units == "imperial" ? property.impSuffix || property.suffix : property.suffix
        if (suffix) {
            valueText += ` ${suffix}`
        }

        // Boolean do not need the "is" text.
        if (property.type == "boolean") {
            return `${fieldText}: ${valueText}`
        }

        return `${fieldText} ${operatorText} ${valueText}`
    }

    /**
     * Returns the text for the specified condition.
     * @param condition The recipe condition.
     */
    const conditionPropertyText = (condition: any): string => (_.find(store.recipeProperties, {value: condition.property}) as any)?.text

    /**
     * Returns the code for the recipe logical operators (ALL, ANY or SOME).
     * @param recipe The recipe.
     */
    const codeLogicalOperator = (recipe: any): string => {
        if (recipe.op == "AND" && (recipe.samePropertyOp == "AND" || recipe.conditions.length < 3)) return "ALL"
        if (recipe.op == "OR" && (recipe.samePropertyOp == "OR" || recipe.conditions.length < 3)) return "ANY"
        return "SOME"
    }

    /**
     * Share the specified recipe.
     * @param recipe The recipe.
     */
    const shareRecipe = async (recipe: any): Promise<void> => {
        const data = {
            title: recipe.title,
            actions: recipe.actions,
            conditions: recipe.conditions,
            defaultFor: recipe.defaultFor,
            op: recipe.op,
            samePropertyOp: recipe.samePropertyOp
        }

        try {
            const sharedRecipe: any = await api(`/api/shared-recipes/${store.user.id}/new`, {method: "POST", body: data})
            router.push({path: "/automations/shared", query: {new: sharedRecipe.id, title: sharedRecipe.title}})
        } catch (ex) {
            webError("useRecipe.shareRecipe", ex)
        }
    }

    return {
        mainActivityTags: activityTags.mainActivityTags,
        extraActivityTags: activityTags.extraActivityTags,
        booleanActions,
        recipeRules,
        actionSummary,
        actionText,
        conditionSummary,
        conditionPropertyText,
        codeLogicalOperator,
        shareRecipe
    }
}
