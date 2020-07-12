// Strautomator Core: Recipe list items

/**
 * List of possible recipe operators for the different data types.
 */
export const recipeOperatorList = {
    // Free text.
    text: [
        {value: "like", text: "has", description: "Text contains the specified value"},
        {value: "=", text: "is exactly", description: "Text matches the specified value"}
    ],
    // Only positive numbers.
    number: [
        {value: "like", text: "is around (±10%)", description: "Number is around (±10%) the specified value"},
        {value: "=", text: "is exactly", description: "Number matches the specified value"},
        {value: "<", text: "is lower than", description: "Number less than the specified value"},
        {value: ">", text: "is higher than", description: "Number greater than the specified value"}
    ],
    //Any number.
    anyNumber: [
        {value: "like", text: "is around (±10%)", description: "Number is around (±10%) the specified value"},
        {value: "=", text: "is exactly", description: "Number matches the specified value"},
        {value: "<", text: "is lower than", description: "Number less than the specified value"},
        {value: ">", text: "is higher than", description: "Number greater than the specified value"}
    ],
    // Location coordinates.
    location: [
        {value: "like", text: "within 650m of", description: "Location within 650m (0.4 miles)"},
        {value: "=", text: "within 60m of", description: "Location within 60m (196 foot)"}
    ],
    // Time.
    time: [
        {value: "like", text: "at around (± 30min)", description: "Within 30 minutes of the specified time"},
        {value: "=", text: "at (± 2min)", description: "Within 2 minutes of the specified time"},
        {value: "<", text: "is before", description: "Time is before"},
        {value: ">", text: "is after", description: "Time is after"}
    ],
    // Elapsed time.
    elapsedTime: [
        {value: "like", text: "is around (± 30min)", description: "Elapsed time within 30 minutes of the specified value"},
        {value: "=", text: "is (± 2min)", description: "Elapsed time within 2 minutes of the specified value"},
        {value: "<", text: "is less than", description: "Elapsed time is less than"},
        {value: ">", text: "is more than", description: "Elapsed time is more than"}
    ],
    // Day of week.
    day: [{value: "=", text: "is", description: ""}]
}

/**
 * List of possible recipe properties, with descriptions and operators.
 */
export const recipePropertyList = [
    {value: "distance", text: "Distance", type: "number", operators: recipeOperatorList.number, suffix: "km", impSuffix: "mi"},
    {value: "speedAvg", text: "Average speed", type: "number", operators: recipeOperatorList.number, suffix: "km/h", impSuffix: "mph"},
    {value: "speedMax", text: "Max speed", type: "number", operators: recipeOperatorList.number, suffix: "km/h", impSuffix: "mph"},
    {value: "elevationGain", text: "Elevation gain", type: "number", operators: recipeOperatorList.number, suffix: "m", impSuffix: "ft"},
    {value: "elevationMax", text: "Elevation max", type: "number", operators: recipeOperatorList.number, suffix: "m", impSuffix: "ft"},
    {value: "dateStart", text: "Start time", type: "time", operators: recipeOperatorList.time, suffix: "h"},
    {value: "dateEnd", text: "End time", type: "time", operators: recipeOperatorList.time, suffix: "h"},
    {value: "movingTime", text: "Moving time", type: "time", operators: recipeOperatorList.elapsedTime, suffix: "h"},
    {value: "totalTime", text: "Total elapsed time", type: "time", operators: recipeOperatorList.elapsedTime, suffix: "h"},
    {value: "weekday", text: "Week day", type: "day", operators: recipeOperatorList.day},
    {value: "locationStart", text: "Starting location", type: "location", operators: recipeOperatorList.location},
    {value: "locationEnd", text: "End location", type: "location", operators: recipeOperatorList.location},
    {value: "polyline", text: "Passes on location", type: "location", operators: recipeOperatorList.location},
    {value: "wattsAvg", text: "Average power", type: "number", operators: recipeOperatorList.number, suffix: "watts"},
    {value: "wattsWeighted", text: "Normalized power", type: "number", operators: recipeOperatorList.number, suffix: "watts"},
    {value: "wattsMax", text: "Max power", type: "number", operators: recipeOperatorList.number, suffix: "watts"},
    {value: "hrAvg", text: "Average heart rate", type: "number", operators: recipeOperatorList.number, suffix: "bpm"},
    {value: "hrMax", text: "Max heart rate", type: "number", operators: recipeOperatorList.number, suffix: "bpm"},
    {value: "calories", text: "Calories", type: "number", operators: recipeOperatorList.number, suffix: "kcal"},
    {value: "name", text: "Name", type: "text", operators: recipeOperatorList.text},
    {value: "device", text: "GPS device name", type: "text", operators: recipeOperatorList.text},
    {value: "weather.temperature", text: "Weather temperature", type: "anyNumber", operators: recipeOperatorList.anyNumber, suffix: "°C", fSuffix: "°F"},
    {value: "weather.windSpeed", text: "Weather wind speed", type: "number", operators: recipeOperatorList.number, suffix: "m/s", impSuffix: "mph"},
    {value: "weather.humidity", text: "Weather humidity", type: "number", operators: recipeOperatorList.number, suffix: "%"}
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
    {value: "description", text: "Set activity description"},
    {value: "prependDescription", text: "Prepend to activity description"},
    {value: "appendDescription", text: "Append to activity description"},
    {value: "webhook", text: "Webhook URL"}
]
