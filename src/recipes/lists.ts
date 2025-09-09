// Strautomator Core: Recipe list items

/**
 * List of possible recipe operators for the different data types.
 */
export const recipeOperatorList = {
    // Free text.
    text: [
        {value: "any", text: "has any value", description: "Field has any value set"},
        {value: "like", text: "contains", description: "Text contains the value set below"},
        {value: "notlike", text: "does not contain", description: "Text does not contain the value set below"},
        {value: "=", text: "is exactly", description: "Text matches exactly the value set below"}
    ],
    // Only positive numbers.
    number: [
        {value: "like", text: "is around (±10%)", description: "Number is within ±10% of the value set below"},
        {value: "approx", text: "is around (±3%)", description: "Number is within ±3% of the value set below"},
        {value: "=", text: "is exactly", description: "Number matches exactly the value set below"},
        {value: "!=", text: "is not", description: "Number is different than the value set below"},
        {value: "<", text: "is lower than", description: "Number less than the value set below"},
        {value: ">", text: "is higher than", description: "Number greater than the value set below"}
    ],
    // Location coordinates.
    location: [
        {value: "like", text: "within 650m of", impText: "within 710 yards of", description: "Location within 650 meters (710 yards)"},
        {value: "approx", text: "within 300m of", impText: "within 328 yards of", description: "Location within 300 meters (328 yards)"},
        {value: "=", text: "within 60m of", impText: "within 65 yards of", description: "Location within 60 meters (65 yards)"},
        {value: "!=", text: "at least 60m away from", impText: "at least 65 yards away from", description: "Location at least 60 meters (65 yards) away from"}
    ],
    // Time.
    time: [
        {value: "like", text: "at around (±30min)", description: "Time within 30 min. of the value set below"},
        {value: "approx", text: "at around (±10min)", description: "Time within 10 min. of the value set below"},
        {value: "=", text: "at (±1min)", description: "Time within 1 min. of the value set below"},
        {value: "<", text: "is before", description: "Time is before the value set below"},
        {value: ">", text: "is after", description: "Time is after the value set below"}
    ],
    // Elapsed time.
    elapsedTime: [
        {value: "like", text: "is around (±30min)", description: "Elapsed time within 30 min. of the value set below"},
        {value: "approx", text: "is around (±10min)", description: "Elapsed time within 10 min. of the value set below"},
        {value: "=", text: "is exactly (±1min)", description: "Elapsed time within 1 min. of the value set below"},
        {value: "<", text: "is less than", description: "Elapsed time is less than the value set below"},
        {value: ">", text: "is more than", description: "Elapsed time is greater than the value set below"}
    ],
    // Pace.
    pace: [
        {value: "like", text: "is around (±60sec)", description: "Pace within 60 sec. of the value set below"},
        {value: "approx", text: "is around (±20sec)", description: "Pace within 20 sec. of the value set below"},
        {value: "=", text: "is exactly (±1sec)", description: "Pace within 1 sec. of the value set below"},
        {value: "<", text: "is faster than", description: "Pace is faster than the value set below"},
        {value: ">", text: "is slower than", description: "Pace is slower than the value set below"}
    ],
    // Yes or no.
    is: [
        {value: "=", text: "is", description: ""},
        {value: "!=", text: "is not", description: ""}
    ]
}

/**
 * List of possible recipe properties (conditions), with descriptions and operators.
 */
export const recipePropertyList = [
    {value: "sportType", text: "Sport type", type: "sportType", operators: recipeOperatorList.is},
    {value: "distance", text: "Distance", type: "number", operators: recipeOperatorList.number, suffix: "km", impSuffix: "mi"},
    {value: "speedAvg", text: "Average speed", shortText: "Avg speed", type: "number", operators: recipeOperatorList.number, suffix: "km/h", impSuffix: "mph"},
    {value: "speedMax", text: "Maximum speed", type: "number", operators: recipeOperatorList.number, suffix: "km/h", impSuffix: "mph"},
    {value: "paceAvg", text: "Average pace", shortText: "Avg pace", type: "time", operators: recipeOperatorList.pace, suffix: "/km", impSuffix: "/mi"},
    {value: "paceMax", text: "Maximum pace", shortText: "Max pace", type: "time", operators: recipeOperatorList.pace, suffix: "/km", impSuffix: "/mi"},
    {value: "elevationGain", text: "Elevation gain", type: "number", operators: recipeOperatorList.number, suffix: "m", impSuffix: "ft"},
    {value: "elevationMax", text: "Elevation max", type: "number", operators: recipeOperatorList.number, suffix: "m", impSuffix: "ft"},
    {value: "dateStart", text: "Start time", type: "time", operators: recipeOperatorList.time, suffix: "h"},
    {value: "dateEnd", text: "End time", type: "time", operators: recipeOperatorList.time, suffix: "h"},
    {value: "movingTime", text: "Moving time", type: "time", operators: recipeOperatorList.elapsedTime, suffix: "h"},
    {value: "totalTime", text: "Total time", type: "time", operators: recipeOperatorList.elapsedTime, suffix: "h"},
    {value: "weekday", text: "Weekday", type: "day", operators: recipeOperatorList.is},
    {value: "dateRange", text: "Happened within a date range", shortText: "Date range", type: "date", operators: recipeOperatorList.is},
    {value: "hasLocation", text: "Has location data", type: "boolean", operators: recipeOperatorList.is},
    {value: "locationStart", text: "Start location", type: "location", operators: recipeOperatorList.location},
    {value: "locationEnd", text: "End location", type: "location", operators: recipeOperatorList.location},
    {value: "cityStart", text: "Start city", type: "text", operators: recipeOperatorList.is, isPro: true},
    {value: "cityEnd", text: "End city", type: "text", operators: recipeOperatorList.is, isPro: true},
    {value: "polyline", text: "Passes on location", type: "location", operators: recipeOperatorList.location},
    {value: "hasPower", text: "Has a power meter", type: "boolean", operators: recipeOperatorList.is},
    {value: "wattsAvg", text: "Average power", shortText: "Avg power", type: "number", operators: recipeOperatorList.number, suffix: "watts", min: 0, max: 9999},
    {value: "wattsWeighted", text: "Normalized power", type: "number", operators: recipeOperatorList.number, suffix: "watts", min: 0, max: 9999},
    {value: "wattsMax", text: "Maximum power", shortText: "Max power", type: "number", operators: recipeOperatorList.number, suffix: "watts", min: 0, max: 9999},
    {value: "wattsKg", text: "Watts / kg", type: "number", operators: recipeOperatorList.number, min: 0, max: 99},
    {value: "hrAvg", text: "Average heart rate", shortText: "Avg HR", type: "number", operators: recipeOperatorList.number, suffix: "bpm", min: 0, max: 999},
    {value: "hrMax", text: "Max heart rate", shortText: "Max HR", type: "number", operators: recipeOperatorList.number, suffix: "bpm", min: 0, max: 999},
    {value: "hasCadence", text: "Has a cadence sensor", type: "boolean", operators: recipeOperatorList.is},
    {value: "cadenceAvg", text: "Average cadence", shortText: "Avg cadence", type: "number", operators: recipeOperatorList.number, suffix: "rpm", min: 0, max: 999},
    {value: "calories", text: "Calories", type: "number", operators: recipeOperatorList.number, suffix: "kcal", min: 0, max: 99999},
    {value: "relativeEffort", text: "Relative effort", type: "number", operators: recipeOperatorList.number, min: 0, max: 99999},
    {value: "perceivedExertion", text: "Perceived exertion", type: "number", operators: recipeOperatorList.number, min: 0, max: 10},
    {value: "tss", text: "Training stress score", shortText: "TSS", type: "number", operators: recipeOperatorList.number, min: 0, max: 999},
    {value: "name", text: "Name", type: "text", operators: recipeOperatorList.text},
    {value: "description", text: "Description", type: "text", operators: recipeOperatorList.text},
    {value: "lapCount", text: "Lap count", type: "number", operators: recipeOperatorList.number},
    {value: "lapDistance", text: "Lap distance", type: "number", operators: recipeOperatorList.number},
    {value: "lapTime", text: "Lap time", type: "time", operators: recipeOperatorList.elapsedTime, suffix: "m"},
    {value: "hasPhotos", text: "Has photos", type: "boolean", operators: recipeOperatorList.is},
    {value: "newRecords", text: "Has new 'all time' records", type: "boolean", operators: recipeOperatorList.is},
    {value: "komSegments", text: "Has new segment KOMs", type: "boolean", operators: recipeOperatorList.is},
    {value: "prSegments", text: "Has new segment PRs", type: "boolean", operators: recipeOperatorList.is},
    {value: "gear", text: "Gear", type: "gear", operators: recipeOperatorList.is},
    {value: "device", text: "Device or app", type: "text", operators: recipeOperatorList.text},
    {value: "temperature", text: "Device temperature", shortText: "Device temp", type: "anyNumber", operators: recipeOperatorList.number, suffix: "°C", fSuffix: "°F"},
    {value: "co2Saved", text: "CO2 saved", type: "number", operators: recipeOperatorList.number, suffix: "kg"},
    {value: "workout", text: "Tagged as workout", type: "boolean", operators: recipeOperatorList.is},
    {value: "race", text: "Tagged as race", type: "boolean", operators: recipeOperatorList.is},
    {value: "commute", text: "Tagged as commute", type: "boolean", operators: recipeOperatorList.is},
    {value: "trainer", text: "Using a trainer machine", type: "boolean", operators: recipeOperatorList.is},
    {value: "manual", text: "Created manually", type: "boolean", operators: recipeOperatorList.is},
    {value: "flagged", text: "Flagged", type: "boolean", operators: recipeOperatorList.is},
    {value: "garmin.sensor", text: "Garmin sensor ID", type: "string", operators: recipeOperatorList.is, isPro: true},
    {value: "garmin.primaryBenefit", text: "Garmin primary benefit", type: "string", operators: recipeOperatorList.is, isPro: true},
    {value: "garmin.tss", text: "Garmin TSS", type: "number", operators: recipeOperatorList.number, isPro: true},
    {value: "garmin.trainingLoad", text: "Garmin training load", type: "number", operators: recipeOperatorList.number, isPro: true},
    {value: "garmin.intensityFactor", text: "Garmin intensity factor", type: "number", operators: recipeOperatorList.number, isPro: true},
    {value: "garmin.aerobicTrainingEffect", text: "Garmin aerobic training effect", type: "number", operators: recipeOperatorList.number, min: 0, max: 5, isPro: true},
    {value: "garmin.anaerobicTrainingEffect", text: "Garmin anaerobic training effect", type: "number", operators: recipeOperatorList.number, min: 0, max: 5, isPro: true},
    {value: "garmin.pedalSmoothness", text: "Garmin pedal smoothness", type: "number", operators: recipeOperatorList.number, suffix: "%", min: 0, max: 100, isPro: true},
    {value: "garmin.pedalTorqueEffect", text: "Garmin pedal torque effectiveness", type: "number", operators: recipeOperatorList.number, suffix: "%", min: 0, max: 100, isPro: true},
    {value: "garmin.sportProfile", text: "Garmin sport profile name", type: "string", operators: recipeOperatorList.is, isPro: true},
    {value: "garmin.name", text: "Garmin activity name", type: "string", operators: recipeOperatorList.text, isPro: true},
    {value: "garmin.workoutName", text: "Garmin workout name", type: "string", operators: recipeOperatorList.text, isPro: true},
    {value: "garmin.workoutNotes", text: "Garmin workout notes", type: "string", operators: recipeOperatorList.text, isPro: true},
    {value: "wahoo.sensor", text: "Wahoo sensor ID", type: "string", operators: recipeOperatorList.is, isPro: true},
    {value: "weather.temperature", text: "Weather temperature", shortText: "Temperature", type: "anyNumber", operators: recipeOperatorList.number, suffix: "°C", fSuffix: "°F"},
    {value: "weather.windSpeed", text: "Weather wind speed", shortText: "Wind", type: "number", operators: recipeOperatorList.number, suffix: "kph", impSuffix: "mph"},
    {value: "weather.humidity", text: "Weather humidity", shortText: "Humidity", type: "number", operators: recipeOperatorList.number, suffix: "%", min: 0, max: 100},
    {value: "weather.aqi", text: "Air Quality Index", shortText: "AQI", type: "number", operators: recipeOperatorList.number, min: 0, max: 5},
    {value: "spotify.track", text: "Listened Spotify track name", type: "text", operators: recipeOperatorList.text},
    {value: "firstOfDay.anySport", text: "Is today's first activity (any sport)", type: "boolean", operators: recipeOperatorList.is},
    {value: "firstOfDay.sameSport", text: "Is today's first activity (same sport)", type: "boolean", operators: recipeOperatorList.is},
    {value: "firstOfDay.recipe", text: "Automation is executing for the first time today", type: "boolean", operators: recipeOperatorList.is}
]

/**
 * List of possible recipe actions.
 */
export const recipeActionList = [
    {value: "commute", text: "Tag activity as commute"},
    {value: "trainer", text: "Tag activity as virtual (trainer)"},
    {value: "gear", text: "Set activity gear"},
    {value: "name", text: "Set activity name"},
    {value: "prependName", text: "Prepend to activity name"},
    {value: "appendName", text: "Append to activity name"},
    {value: "generateName", text: "Generate the activity name with AI"},
    {value: "generateDescription", text: "Generate a poem with AI", isPro: true},
    {value: "description", text: "Set activity description"},
    {value: "prependDescription", text: "Prepend to activity description"},
    {value: "appendDescription", text: "Append to activity description"},
    {value: "sportType", text: "Change sport type"},
    {value: "workoutType", text: "Set workout type"},
    {value: "privateNote", text: "Set private notes"},
    {value: "prependPrivateNote", text: "Prepend to private notes"},
    {value: "appendPrivateNote", text: "Append to private notes"},
    {value: "generateInsights", text: "Analysis on private notes with AI", isPro: true},
    {value: "mapStyle", text: "Set map style"},
    {value: "hideHome", text: "Mute (activity hidden on home feeds)"},
    {value: "hideStatPace", text: "Hide pace"},
    {value: "hideStatSpeed", text: "Hide speed"},
    {value: "hideStatCalories", text: "Hide calories"},
    {value: "hideStatHeartRate", text: "Hide heart rate"},
    {value: "hideStatPower", text: "Hide power"},
    {value: "hideStatStartTime", text: "Hide start time"},
    {value: "enableGearComponent", text: "Enable Gear component"},
    {value: "disableGearComponent", text: "Disable Gear component"},
    {value: "webhook", text: "Webhook", isPro: true}
]
