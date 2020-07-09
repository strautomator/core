// Strautomator Core: Recipes

import {recipePropertyList, recipeActionList} from "./lists"
import {defaultAction, commuteAction, gearAction, webhookAction} from "./actions"
import {checkText, checkLocation, checkWeekday, checkTimestamp, checkWeather, checkNumber} from "./conditions"
import {RecipeAction, RecipeActionType, RecipeCondition, RecipeData, RecipeOperator, RecipeStats} from "./types"
import {StravaActivity} from "../strava/types"
import {UserData} from "../users/types"
import database from "../database"
import _ = require("lodash")
import logger = require("anyhow")
import moment = require("moment")
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

            // Default recipes for a specific sport type should have no conditions, and order 0.
            if (recipe.defaultFor) {
                recipe.order = 0
                recipe.conditions = []
            }
            // Non-default recipes must have conditions defined.
            else {
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

                // Some actions must have a value.
                if (action.type != RecipeActionType.Commute) {
                    if (action.value === null || action.value === "") {
                        throw new Error(`Missing action value`)
                    }
                }

                // Webhook value must be an URL.
                if (action.type == RecipeActionType.Webhook) {
                    const isUrl = /(http|https):\/\/(\w+:{0,1}\w*@)?(\S+)(:[0-9]+)?(\/|\/([\w#!:.?+=&%@!\-\/]))?/.test(action.value)
                    if (!isUrl) {
                        throw new Error(`Webhook URL is not valid`)
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
            for (let condition of recipe.conditions) {
                const valid = await this.checkCondition(user, activity, condition)

                // Recipe not valid for this activity? Log what failed.
                // Polyline contents won't be logged.
                if (!valid) {
                    let conditionProp = condition.property == "polyline" ? null : activity[condition.property]
                    if (_.isDate(conditionProp)) conditionProp = moment(conditionProp).format("lll")

                    let logValue = conditionProp ? `Not a match: ${conditionProp}` : "No match"
                    logger.info("Recipes.evaluate", `User ${user.id}, activity ${activity.id}, recipe ${recipe.id}`, `${condition.property} ${condition.operator} ${condition.value}`, logValue)
                    return false
                }
            }
        }

        // Sort recipe actions, webhook should come last.
        const sortedActions = _.sortBy(recipe.actions, ["type"])

        // Iterate and execute actions.
        for (let action of sortedActions) {
            await this.processAction(user, activity, recipe, action)
        }

        // Update recipe stats and return OK.
        await this.updateStats(user, recipe, activity)
        return true
    }

    /**
     * Check if the passed condition is valid for the activity.
     * @param user The recipe's owner.
     * @param activity Strava activity to be evaluated.
     * @param condition The recipe condition.
     */
    checkCondition = async (user: UserData, activity: StravaActivity, condition: RecipeCondition): Promise<boolean> => {
        try {
            const prop = condition.property.toLowerCase()

            // Weather conditions.
            if (prop.indexOf("weather") >= 0) {
                const valid = await checkWeather(activity, condition, user.preferences)
                if (!valid) return false
            }

            // Location condition.
            else if (prop.indexOf("location") == 0 || prop == "polyline") {
                const valid = checkLocation(activity, condition)
                if (!valid) return false
            }

            // Day of week condition.
            else if (prop == "weekday") {
                const valid = checkWeekday(activity, condition)
                if (!valid) return false
            }

            // Time based condition.
            else if (prop.indexOf("date") == 0 || prop.indexOf("Time") > 0) {
                const valid = checkTimestamp(activity, condition)
                if (!valid) return false
            }

            // Number condition.
            else if (_.isNumber(activity[condition.property])) {
                const valid = checkNumber(activity, condition)
                if (!valid) return false
            }

            // Text condition.
            else {
                const valid = checkText(activity, condition)
                if (!valid) return false
            }

            logger.info("Recipes.checkCondition", `User ${user.id} ${user.displayName}`, `Activity ${activity.id}`, `${condition.property} ${condition.operator} ${condition.value}`)
            return true
        } catch (ex) {
            logger.error("Recipes.checkCondition", `User ${user.id} ${user.displayName}`, `Activity ${activity.id}`, `${condition.property} ${condition.operator} ${condition.value}`, ex)
            return false
        }
    }

    /**
     * Process a value string against an activity and return the final result.
     * @param user The user (owner of the activity).
     * @param activity A Strava activity.
     * @param recipe The source recipe.
     * @param action Recipe action to be executed.
     */
    processAction = async (user: UserData, activity: StravaActivity, recipe: RecipeData, action: RecipeAction): Promise<void> => {
        logger.debug("Recipes.processAction", user, activity, action)

        if (!activity.updatedFields) {
            activity.updatedFields = []
        }

        // Mark activity as commute?
        if (action.type == RecipeActionType.Commute) {
            return commuteAction(user, activity, recipe, action)
        }

        // Change activity gear?
        if (action.type == RecipeActionType.Gear) {
            return gearAction(user, activity, recipe, action)
        }

        // Dispatch acctivity to webhook?
        if (action.type == RecipeActionType.Webhook) {
            return webhookAction(user, activity, recipe, action)
        }

        // Other actions (set description or name).
        return defaultAction(user, activity, recipe, action)
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

    // STATS
    // --------------------------------------------------------------------------

    /**
     * Get stats for the specified recipe, or all recipes if no recipe is passed.
     * @param user The user owner of the recipe(s).
     * @param recipe Optional recipe to be fetched.
     */
    getStats = async (user: UserData, recipe?: RecipeData): Promise<RecipeStats | RecipeStats[]> => {
        try {
            if (recipe) {
                const id = `${user.id}-${recipe.id}`
                const stats: RecipeStats = await database.get("recipe-stats", id)

                // No stats for the specified recipe? Return null.
                if (!stats) {
                    logger.info("Recipe.getStats", `User ${user.id} ${user.displayName}`, `No stats for recipe ${recipe.id}`)
                    return null
                }

                const lastTrigger = moment(stats.dateLastTrigger).format("lll")
                logger.info("Recipe.getStats", `User ${user.id} ${user.displayName}`, `Recipe ${recipe.id}`, `${stats.activities.length} activities`, `Last triggered: ${lastTrigger}`)
                return stats
            } else {
                const arrStats: RecipeStats[] = await database.search("recipe-stats", ["userId", "==", user.id])

                // No recipe stats found at all for the user?
                if (arrStats.length == 0) {
                    logger.info("Recipe.getStats", `User ${user.id} ${user.displayName}`, "No recipe stats found")
                    return []
                }

                logger.info("Recipe.getStats", `User ${user.id} ${user.displayName}`, `${arrStats.length} recipe stats found`)
                return arrStats
            }
        } catch (ex) {
            const recipeLog = recipe ? `Recipe ${recipe.id}` : `All recipes`
            logger.error("Recipes.getStats", `User ${user.id} ${user.displayName}`, recipeLog, ex)
            throw ex
        }
    }

    /**
     * Increment a recipe's trigger count.
     * @param user The user to have activity count incremented.
     * @param recipe The recipe to be updated.
     * @param activity The activity that triggered the recipe.
     */
    updateStats = async (user: UserData, recipe: RecipeData, activity: StravaActivity): Promise<void> => {
        const id = `${user.id}-${recipe.id}`

        try {
            const now = moment.utc().toDate()

            // Check if a stats document already exists.
            const doc = database.doc("recipe-stats", id)
            const docSnapshot = await doc.get()
            const exists = docSnapshot.exists
            let stats: RecipeStats

            // If not existing, create a new stats object.
            if (!exists) {
                stats = {
                    id: id,
                    userId: user.id,
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
            logger.error("Recipes.updateStats", id, `Activity ${activity.id}`, ex)
        }
    }
}

// Exports...
export default Recipes.Instance
