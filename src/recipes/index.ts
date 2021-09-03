// Strautomator Core: Recipes

import {recipePropertyList, recipeActionList} from "./lists"
import {defaultAction, commuteAction, gearAction, webhookAction} from "./actions"
import {checkBoolean, checkLocation, checkNumber, checkSportType, checkText, checkTimestamp, checkWeather, checkWeekday} from "./conditions"
import {RecipeAction, RecipeActionType, RecipeCondition, RecipeData, RecipeOperator} from "./types"
import {StravaActivity} from "../strava/types"
import {UserData} from "../users/types"
import recipeStats from "./stats"
import _ = require("lodash")
import logger = require("anyhow")
import dayjs from "../dayjs"
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
     * Recipe stats.
     */
    stats = recipeStats

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

        // Recipe disabled? Stop here.
        if (recipe.disabled) {
            logger.info("Recipes.evaluate", `User ${user.id}`, `Activity ${activity.id}`, `Recipe ${recipe.id} is disabled`)
            return false
        }

        // If recipe is default for a sport, check the type.
        if (recipe.defaultFor) {
            if (activity.type != recipe.defaultFor) {
                return false
            }
        }

        // Otherwise iterate conditions and evaluate each one.
        else {
            logger.info("Recipes.evaluate", `User ${user.id}`, `Activity ${activity.id}`, `Recipe ${recipe.id} - ${recipe.title}`, `Will check ${recipe.conditions.length} conditions`)

            for (let condition of recipe.conditions) {
                const valid = await this.checkCondition(user, activity, recipe, condition)

                // Recipe not valid for this activity? Log what failed.
                // Polyline contents won't be logged.
                if (!valid) {
                    let conditionProp = condition.property == "polyline" ? null : activity[condition.property]
                    if (_.isDate(conditionProp)) conditionProp = dayjs(conditionProp).format("lll")

                    let logValue = conditionProp ? `Not a match: ${conditionProp}` : "No match"
                    logger.info("Recipes.evaluate", `User ${user.id}`, `Activity ${activity.id}`, `Recipe ${recipe.id}`, `${condition.property} ${condition.operator} ${condition.value}`, logValue)
                    return false
                }
            }
        }

        const logConditions = recipe.conditions.map((c) => c.property).join(", ")
        logger.info("Recipes.evaluate", `User ${user.id}`, `Activity ${activity.id}`, `Recipe ${recipe.id} - ${recipe.title}`, `Evaluated: ${logConditions}`)

        // Sort recipe actions, webhook should come last.
        const sortedActions = _.sortBy(recipe.actions, ["type"])

        // Iterate and execute actions.
        let success: boolean = true
        for (let action of sortedActions) {
            success = success && (await this.processAction(user, activity, recipe, action))
        }

        // Update recipe stats.
        await recipeStats.updateStats(user, recipe, activity, success)

        return true
    }

    /**
     * Check if the passed condition is valid for the activity.
     * @param user The recipe's owner.
     * @param activity Strava activity to be evaluated.
     * @param recipe Recipe being evaluated.
     * @param condition The recipe condition.
     */
    checkCondition = async (user: UserData, activity: StravaActivity, recipe: RecipeData, condition: RecipeCondition): Promise<boolean> => {
        try {
            const prop = condition.property

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

            // Sport type condition.
            else if (prop == "sportType") {
                const valid = checkSportType(activity, condition)
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

            // Boolean condition.
            else if (_.isBoolean(condition.value)) {
                const valid = checkBoolean(activity, condition)
                if (!valid) return false
            }

            // Text condition (default).
            else {
                const valid = checkText(activity, condition)
                if (!valid) return false
            }

            logger.debug("Recipes.checkCondition", `User ${user.id} ${user.displayName}`, `Activity ${activity.id}`, `Recipe ${recipe.id}`, `${condition.property} ${condition.operator} ${condition.value}`)
            return true
        } catch (ex) {
            logger.error("Recipes.checkCondition", `User ${user.id} ${user.displayName}`, `Activity ${activity.id}`, `Recipe ${recipe.id}`, `${condition.property} ${condition.operator} ${condition.value}`, ex)
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
    processAction = async (user: UserData, activity: StravaActivity, recipe: RecipeData, action: RecipeAction): Promise<boolean> => {
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
}

// Exports...
export default Recipes.Instance
