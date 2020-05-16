// Strautomator Core: Recipes

import {recipePropertyList, recipeActionList} from "./lists"
import {checkText, checkLocation, checkWeekday, checkTimestamp, checkWeather, checkNumber} from "./conditions"
import {RecipeAction, RecipeActionType, RecipeCondition, RecipeData, RecipeOperator, RecipeStats} from "./types"
import {StravaActivity} from "../strava/types"
import {UserData} from "../users/types"
import database from "../database"
import weather from "../weather"
import _ = require("lodash")
import jaul = require("jaul")
import logger = require("anyhow")

const settings = require("setmeup").settings

/**
 * Evaluate and process automation recipes.
 */
export class Recipes {
    private constructor() {}
    private static _instance: Recipes
    static get Instance() {
        return this._instance || (this._instance = new this())
    }

    /**
     * List of possible property names for conditions.
     */
    get propertyList() {
        return recipePropertyList
    }

    /**
     * List of possible recipe actions.
     */
    get actionList() {
        return recipeActionList
    }

    // PROCESSING
    // --------------------------------------------------------------------------

    /**
     * Validate a recipe, mostly called before saving to the database.
     * Will throw an error when something wrong is found.
     * @param recipe The recipe object.
     */
    validate = (recipe: RecipeData): void => {
        try {
            if (!recipe) {
                throw new Error("Recipe is empty")
            }

            if (!recipe.title) {
                throw new Error("Missing recipe title")
            }

            if (recipe.title.length > settings.recipes.maxLength.title) {
                throw new Error(`Recipe title is too long (max length is ${settings.recipes.maxLength.title})`)
            }

            if (!recipe.actions || !_.isArray(recipe.actions) || recipe.actions.length < 0) {
                throw new Error("Missing recipe actions")
            }

            if (recipe.order && isNaN(recipe.order)) {
                throw new Error("Recipe order must be a number")
            }

            // Non-default recipes must have conditions defined.
            if (!recipe.defaultFor) {
                if (!recipe.conditions || !_.isArray(recipe.conditions) || recipe.conditions.length < 0) {
                    throw new Error("Missing recipe conditions")
                }

                // Parse recipe conditions.
                for (let condition of recipe.conditions) {
                    if (!condition.property) {
                        throw new Error(`Missing condition property`)
                    }
                    if (!Object.values(RecipeOperator).includes(condition.operator)) {
                        throw new Error(`Invalid condition operator: ${condition.operator}`)
                    }
                    if (condition.value === null || condition.value === "") {
                        throw new Error(`Missing condition value`)
                    }
                    if (_.isString(condition.value) && (condition.value as string).length > settings.recipes.maxLength.conditionValue) {
                        throw new Error(`Condition value is too long (max length is ${settings.recipes.maxLength.conditionValue})`)
                    }
                    if (condition.friendlyValue && _.isString(condition.friendlyValue) && (condition.friendlyValue as string).length > settings.recipes.maxLength.conditionValue) {
                        throw new Error(`Condition friendly value is too long (max length is ${settings.recipes.maxLength.conditionValue})`)
                    }

                    // Check for non-schema fields.
                    const keys = Object.keys(condition)
                    for (let key of keys) {
                        if (["property", "operator", "value", "friendlyValue"].indexOf(key) < 0) {
                            throw new Error(`Invalid field: ${key}`)
                        }
                    }
                }
            }

            // Parse recipe actions.
            for (let action of recipe.actions) {
                if (!Object.values(RecipeActionType).includes(action.type)) {
                    throw new Error(`Invalid action type: ${action.type}`)
                }
                if (action.type != RecipeActionType.Commute) {
                    if (action.value === null || action.value === "") {
                        throw new Error(`Missing action value`)
                    }
                }
                if (action.value && _.isString(action.value) && (action.value as string).length > settings.recipes.maxLength.actionValue) {
                    throw new Error(`Action value is too long (max length is ${settings.recipes.maxLength.actionValue})`)
                }

                // Check for non-schema fields.
                const keys = Object.keys(action)
                for (let key of keys) {
                    if (["type", "value", "friendlyValue"].indexOf(key) < 0) {
                        throw new Error(`Invalid field: ${key}`)
                    }
                }
            }
        } catch (ex) {
            logger.error("Recipes.validate", JSON.stringify(recipe, null, 0), ex)
            throw ex
        }
    }

    /**
     * Evaluate the activity against the defined conditions and actions,
     * and return the updated Strava activity.
     * @param user The recipe's owner.
     * @param id The recipe ID.
     * @param activity Strava activity to be evaluated.
     */
    evaluate = async (user: UserData, id: string, activity: StravaActivity): Promise<boolean> => {
        const recipe: RecipeData = user.recipes[id]

        if (!recipe) {
            throw new Error(`Recipe ${id} not found`)
        }

        // If recipe is default for a sport, check the type.
        if (recipe.defaultFor) {
            if (activity.type != recipe.defaultFor) {
                return false
            }
        }

        // Otherwise iterate conditions and evaluate each one.
        else {
            for (let c of recipe.conditions) {
                try {
                    const prop = c.property.toLowerCase()

                    // Weather conditions.
                    if (prop.indexOf("weather") >= 0) {
                        if (!(await checkWeather(activity, c, user.preferences))) {
                            return false
                        }
                    }

                    // Location condition.
                    if (prop.indexOf("location") >= 0) {
                        if (!checkLocation(activity, c)) {
                            return false
                        }
                    }

                    // Day of week condition.
                    else if (prop.indexOf("weekday") >= 0) {
                        if (!checkWeekday(activity, c)) {
                            return false
                        }
                    }

                    // Time based condition.
                    else if (prop.indexOf("date") >= 0) {
                        if (!checkTimestamp(activity, c)) {
                            return false
                        }
                    }

                    // Number condition.
                    else if (_.isNumber(activity[c.property])) {
                        if (!checkNumber(activity, c)) {
                            return false
                        }
                    }

                    // Text condition.
                    else {
                        if (!checkText(activity, c)) {
                            return false
                        }
                    }
                } catch (ex) {
                    logger.error("Recipes.evaluate", `User ${user.id}`, `Activity ${activity.id}`, Object.values(c).join(", "), ex)
                    return false
                }
            }
        }

        // Iterate and execute actions.
        for (let action of recipe.actions) {
            await this.processAction(user, activity, action)
        }

        // Update recipe stats and return OK.
        await this.updateStats(user, recipe, activity)
        return true
    }

    /**
     * Process a value string against an activity and return the final result.
     * @param user The user (owner of the activity).
     * @param activity A Strava activity.
     * @param action Recipe action to be executed.
     */
    processAction = async (user: UserData, activity: StravaActivity, action: RecipeAction): Promise<void> => {
        logger.debug("Recipes.processAction", user, activity, action)

        try {
            if (!activity.updatedFields) {
                activity.updatedFields = []
            }

            // Mark activity as commute?
            if (action.type == RecipeActionType.Commute) {
                activity.commute = true
                activity.updatedFields.push("commute")
                return
            }

            // Change activity gear?
            if (action.type == RecipeActionType.Gear) {
                let gear = _.find(user.profile.bikes, {id: action.value})
                if (!gear) {
                    gear = _.find(user.profile.shoes, {id: action.value})
                }
                if (!gear) {
                    this.reportInvalidAction(user, action, "Gear not found")
                } else {
                    activity.gear = gear
                    activity.updatedFields.push("gear")
                }
                return
            }

            let processedValue = action.value

            // Append suffixes to values before processing.
            const activityWithSuffix: StravaActivity = _.cloneDeep(activity)
            for (let prop of recipePropertyList) {
                if (prop.suffix && activityWithSuffix[prop.value]) {
                    activityWithSuffix[prop.value] = `${activityWithSuffix[prop.value]}${prop.suffix}`
                }
            }

            // Iterate activity properties and replace keywords set on the action value.
            processedValue = jaul.data.replaceTags(processedValue, activityWithSuffix)

            // Weather tags on the value? Fetch weather and process it, but only if activity has a location set.
            if (processedValue.indexOf("${weather.") >= 0) {
                if (activity.locationStart && activity.locationStart.length > 0) {
                    const weatherSummary = await weather.getActivityWeather(activity, user.preferences)

                    if (weatherSummary) {
                        const weatherDetails = weatherSummary.end || weatherSummary.start
                        processedValue = jaul.data.replaceTags(processedValue, weatherDetails, "weather.")
                    } else {
                        processedValue = jaul.data.replaceTags(processedValue, weather.emptySummary, "weather.")
                    }
                } else {
                    logger.warn("Recipes.processAction", `User ${user.id}`, `Activity ${activity.id}`, "Weather tags on recipe, but no location data on activity")
                    processedValue = jaul.data.replaceTags(processedValue, weather.emptySummary, "weather.")
                }
            }

            // Change activity name?
            if (action.type == RecipeActionType.Name) {
                activity.name = processedValue
                activity.updatedFields.push("name")
                return
            }

            // Change activity description?
            if (action.type == RecipeActionType.Description) {
                activity.description = processedValue
                activity.updatedFields.push("description")
                return
            }
        } catch (ex) {
            logger.error("Recipes.processAction", `User ${user.id}`, `Activity ${activity.id}`, `Action ${action.type}`, ex)
        }
    }

    /**
     * String representation of the recipe.
     * @param recipe The recipe to get the summary for.
     */
    getSummary = (recipe: RecipeData): string => {
        const result = []

        for (let condition of recipe.conditions) {
            result.push(`${condition.property} ${condition.operator} ${condition.value}`)
        }

        for (let action of recipe.actions) {
            result.push(`${action.type}: ${action.value}`)
        }

        return result.join(", ")
    }

    /**
     * String representation of a recipe action.
     * @param action The recipe action to get the summary for.
     */
    getActionSummary = (action: RecipeAction): string => {
        const actionType = _.find(recipeActionList, {value: action.type}).text
        const valueText = action.friendlyValue || action.value

        if (action.value && action.type != "commute") {
            return `${actionType}: ${valueText}`
        } else {
            return `${actionType}`
        }
    }

    /**
     * String representation of a recipe condition.
     * @param condition The recipe condition to get the summary for.
     */
    getConditionSummary = (condition: RecipeCondition): string => {
        const property = _.find(recipePropertyList, {value: condition.property})
        const fieldText = property.text
        const operatorText = _.find(property.operators, {value: condition.operator}).text
        let valueText = condition.friendlyValue || condition.value

        if (property.suffix) {
            valueText += ` ${property.suffix}`
        }

        return `${fieldText} ${operatorText} ${valueText}`
    }

    /**
     * Increment a recipe's trigger count.
     * @param user The user to have activity count incremented.
     * @param recipe The recipe to be updated.
     */
    updateStats = async (user: UserData, recipe: RecipeData, activity: StravaActivity): Promise<void> => {
        try {
            const now = new Date()

            // Set ID and check if a stats document already exists.
            const id = `${user.id}-${recipe.id}`
            const doc = database.doc("recipe-stats", id)
            const docSnapshot = await doc.get()
            const exists = docSnapshot.exists
            let stats: RecipeStats

            // If not existing, create a new stats object.
            if (!exists) {
                stats = {
                    id: id,
                    activities: [activity.id],
                    dateLastTrigger: now
                }

                logger.info("Recipe.updateStats", id, "Created")
            } else {
                stats = docSnapshot.data() as RecipeStats

                if (stats.activities.indexOf(activity.id) < 0) {
                    stats.activities.push(activity.id)
                }

                stats.dateLastTrigger = now
            }

            // Save stats to the database.
            await database.merge("recipe-stats", stats, doc)
            logger.info("Recipe.updateStats", id, `Added activity ${activity.id}`)
        } catch (ex) {
            logger.error("Recipes.updateStats", `User ${user.id}`, `Recipe ${recipe.id}`, `Activity ${activity.id}`, ex)
        }
    }

    // HELPERS
    // --------------------------------------------------------------------------

    /**
     * Alert when a specific action has invalid parameters.
     * @param user The recipe's owner.
     * @param action The action with an invalid parameter.
     */
    reportInvalidAction = (user: UserData, action: RecipeAction, message?: string) => {
        logger.warn("Recipes.reportInvalidAction", `User ${user.id}`, `Action ${action.type}: ${action.value}`, message)
    }
}

// Exports...
export default Recipes.Instance
