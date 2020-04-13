"use strict";
// Strautomator Core: Recipe list items
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * List of possible recipe operators for the different data types.
 */
exports.recipeOperatorList = {
    text: [
        { value: "like", text: "has", description: "Text contains the specified value" },
        { value: "=", text: "is exactly", description: "Text matches the specified value" }
    ],
    number: [
        { value: "=", text: "is exactly", description: "Number matches the specified value" },
        { value: "<", text: "is less than", description: "Number less than the specified value" },
        { value: ">", text: "is more than", description: "Number greater than the specified value" }
    ],
    time: [
        { value: "<", text: "is before", description: "" },
        { value: ">", text: "is after", description: "" },
        { value: "like", text: "is around", description: "Time within 20 minutes of the specified value" },
        { value: "=", text: "is exactly", description: "Time within 1 minute of the specified value" }
    ],
    location: [
        { value: "=", text: "within 40m of", description: "" },
        { value: "like", text: "within 500m of", description: "" }
    ]
};
/**
 * List of possible recipe properties, with descriptions and operators.
 */
exports.recipePropertyList = [
    { value: "name", text: "Name", type: "text", operators: exports.recipeOperatorList.text },
    { value: "distance", text: "Distance", type: "number", operators: exports.recipeOperatorList.number, suffix: "km" },
    { value: "elevation", text: "Elevation", type: "number", operators: exports.recipeOperatorList.number, suffix: "m" },
    { value: "dateStart", text: "Start time", type: "time", operators: exports.recipeOperatorList.time, suffix: "h" },
    { value: "dateEnd", text: "End time", type: "time", operators: exports.recipeOperatorList.time, suffix: "h" },
    { value: "movingTime", text: "Moving time", type: "number", operators: exports.recipeOperatorList.number, suffix: "h" },
    { value: "locationStart", text: "Starting location", type: "location", operators: exports.recipeOperatorList.location },
    { value: "locationEnd", text: "End location", type: "location", operators: exports.recipeOperatorList.location },
    { value: "speedAvg", text: "Average speed", type: "number", operators: exports.recipeOperatorList.number, suffix: "km/h" },
    { value: "speedMax", text: "Max speed", type: "number", operators: exports.recipeOperatorList.number, suffix: "km/h" },
    { value: "device", text: "Device name", type: "text", operators: exports.recipeOperatorList.text }
];
/**
 * List of possible recipe actions.
 */
exports.recipeActionList = [
    { value: "commute", text: "Mark activity as commute" },
    { value: "name", text: "Set activity name" },
    { value: "description", text: "Set activity description" },
    { value: "gear", text: "Set activity gear" }
];
