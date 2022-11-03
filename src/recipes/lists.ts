// Strautomator Core: Recipe list items

/**
 * List of possible recipe operators for the different data types.
 */
export const recipeOperatorList = {
    // Free text.
    text: [
        {value: "=", text: "is exactly", description: "Text matches the specified value"},
        {value: "like", text: "has", description: "Text contains the specified value"},
        {value: "notlike", text: "does not have", description: "Text does not contain the specified value"}
    ],
    // Only positive numbers.
    number: [
        {value: "like", text: "is around (±10%)", description: "Number is around (±10%) the specified value"},
        {value: "=", text: "is exactly", description: "Number matches the specified value"},
        {value: "<", text: "is lower than", description: "Number less than the specified value"},
        {value: ">", text: "is higher than", description: "Number greater than the specified value"}
    ],
    // Any number.
    anyNumber: [
        {value: "like", text: "is around (±10%)", description: "Number is around (±10%) the specified value"},
        {value: "=", text: "is exactly", description: "Number matches the specified value"},
        {value: "<", text: "is lower than", description: "Number less than the specified value"},
        {value: ">", text: "is higher than", description: "Number greater than the specified value"}
    ],
    // Location coordinates.
    location: [
        {value: "like", text: "within 650m of", description: "Location within 650m (710 yards)"},
        {value: "approx", text: "within 300m of", description: "Location within 300m (328 yards)"},
        {value: "=", text: "within 60m of", description: "Location within 60m (65 yards)"}
    ],
    // Time.
    time: [
        {value: "like", text: "at around (± 30min)", description: "Within 30 minutes of the specified time"},
        {value: "approx", text: "at around (± 10min)", description: "Within 10 minutes of the specified time"},
        {value: "=", text: "at (± 2min)", description: "Within 2 minutes of the specified time"},
        {value: "<", text: "is before", description: "Time is before"},
        {value: ">", text: "is after", description: "Time is after"}
    ],
    // Elapsed time.
    elapsedTime: [
        {value: "like", text: "is around (± 30min)", description: "Elapsed time within 30 minutes of the specified value"},
        {value: "approx", text: "is around (± 10min)", description: "Elapsed time within 10 minutes of the specified value"},
        {value: "=", text: "is (± 2min)", description: "Elapsed time within 2 minutes of the specified value"},
        {value: "<", text: "is less than", description: "Elapsed time is less than"},
        {value: ">", text: "is more than", description: "Elapsed time is more than"}
    ],
    // Only "is" as operator.
    is: [{value: "=", text: "is", description: ""}]
}

/**
 * List of possible recipe properties, with descriptions and operators.
 */
export const recipePropertyList = [
    {value: "sportType", text: "Sport type", type: "sportType", operators: recipeOperatorList.is},
    {value: "distance", text: "Distance", type: "number", operators: recipeOperatorList.number, suffix: "km", impSuffix: "mi"},
    {value: "speedAvg", text: "Average speed", type: "number", operators: recipeOperatorList.number, suffix: "km/h", impSuffix: "mph"},
    {value: "speedMax", text: "Max speed", type: "number", operators: recipeOperatorList.number, suffix: "km/h", impSuffix: "mph"},
    {value: "elevationGain", text: "Elevation gain", type: "number", operators: recipeOperatorList.number, suffix: "m", impSuffix: "ft"},
    {value: "elevationMax", text: "Elevation max", type: "number", operators: recipeOperatorList.number, suffix: "m", impSuffix: "ft"},
    {value: "dateStart", text: "Start time", type: "time", operators: recipeOperatorList.time, suffix: "h"},
    {value: "dateEnd", text: "End time", type: "time", operators: recipeOperatorList.time, suffix: "h"},
    {value: "movingTime", text: "Moving time", type: "time", operators: recipeOperatorList.elapsedTime, suffix: "h"},
    {value: "totalTime", text: "Total elapsed time", type: "time", operators: recipeOperatorList.elapsedTime, suffix: "h"},
    {value: "weekday", text: "Week day", type: "day", operators: recipeOperatorList.is},
    {value: "hasLocation", text: "Has location data", type: "boolean", operators: recipeOperatorList.is},
    {value: "locationStart", text: "Starting location", type: "location", operators: recipeOperatorList.location},
    {value: "locationEnd", text: "End location", type: "location", operators: recipeOperatorList.location},
    {value: "polyline", text: "Passes on location", type: "location", operators: recipeOperatorList.location},
    {value: "hasPower", text: "Has a power meter", type: "boolean", operators: recipeOperatorList.is},
    {value: "wattsAvg", text: "Average power", type: "number", operators: recipeOperatorList.number, suffix: "watts", min: 0, max: 5000},
    {value: "wattsWeighted", text: "Normalized power", type: "number", operators: recipeOperatorList.number, suffix: "watts", min: 0, max: 5000},
    {value: "wattsMax", text: "Max power", type: "number", operators: recipeOperatorList.number, suffix: "watts", min: 0, max: 5000},
    {value: "hrAvg", text: "Average heart rate", type: "number", operators: recipeOperatorList.number, suffix: "bpm", min: 0, max: 299},
    {value: "hrMax", text: "Max heart rate", type: "number", operators: recipeOperatorList.number, suffix: "bpm", min: 0, max: 299},
    {value: "calories", text: "Calories", type: "number", operators: recipeOperatorList.number, suffix: "kcal", min: 0, max: 99999},
    {value: "relativeEffort", text: "Relative effort", type: "number", operators: recipeOperatorList.number, min: 0, max: 99999},
    {value: "perceivedExertion", text: "Perceived exertion", type: "number", operators: recipeOperatorList.number, min: 0, max: 10},
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
    {value: "temperature", text: "Device temperature", type: "anyNumber", operators: recipeOperatorList.anyNumber, suffix: "°C", fSuffix: "°F"},
    {value: "trainer", text: "Using a trainer machine", type: "boolean", operators: recipeOperatorList.is},
    {value: "manual", text: "Created manually", type: "boolean", operators: recipeOperatorList.is},
    {value: "weather.temperature", text: "Weather temperature", type: "anyNumber", operators: recipeOperatorList.anyNumber, suffix: "°C", fSuffix: "°F"},
    {value: "weather.windSpeed", text: "Weather wind speed", type: "number", operators: recipeOperatorList.number, suffix: "kph", impSuffix: "mph"},
    {value: "weather.humidity", text: "Weather humidity", type: "number", operators: recipeOperatorList.number, suffix: "%", min: 0, max: 100},
    {value: "spotify.track", text: "Listened Spotify track name", type: "text", operators: recipeOperatorList.text}
]

/**
 * List of possible recipe actions.
 */
export const recipeActionList = [
    {value: "commute", text: "Mark activity as commute"},
    {value: "gear", text: "Set activity gear"},
    {value: "name", text: "Set activity name"},
    {value: "prependName", text: "Prepend to activity name"},
    {value: "appendName", text: "Append to activity name"},
    {value: "generateName", text: "Auto generate the activity name"},
    {value: "description", text: "Set activity description"},
    {value: "prependDescription", text: "Prepend to activity description"},
    {value: "appendDescription", text: "Append to activity description"},
    {value: "sportType", text: "Change sport type"},
    {value: "workoutType", text: "Set workout type"},
    {value: "privateNote", text: "Set private note"},
    {value: "mapStyle", text: "Set map style"},
    {value: "hideHome", text: "Mute (activity hidden on home feeds)"},
    {value: "hideStatPace", text: "Hide stats - pace"},
    {value: "hideStatSpeed", text: "Hide stats - speed"},
    {value: "hideStatCalories", text: "Hide stats - calories"},
    {value: "hideStatHeartRate", text: "Hide stats - heart rate"},
    {value: "hideStatPower", text: "Hide stats - power"},
    {value: "webhook", text: "Webhook URL"}
]
