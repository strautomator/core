// Strautomator Core: Recipes

import {recipePropertyList, recipeActionList} from "./lists"
import {RecipeAction, RecipeActionType, RecipeCondition, RecipeData, RecipeOperator, SharedRecipe} from "./types"
import {generateId} from "./utils"
import * as actions from "./actions"
import * as conditions from "./conditions"
import {StravaActivity} from "../strava/types"
import {UserData} from "../users/types"
import database from "../database"
import eventManager from "../eventmanager"
import recipeStats from "./stats"
import _ from "lodash"
import logger from "anyhow"
import * as logHelper from "../loghelper"
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

    /**
     * Export the generateId() helper.
     */
    generateId = generateId

    // INIT
    // --------------------------------------------------------------------------

    /**
     * Init the Recipes Manager.
     */
    init = async () => {
        eventManager.on("Users.delete", this.onUserDelete)
    }

    /**
     * Delete user recipe stats after it gets deleted from the database.
     * @param user User that was deleted from the database.
     */
    private onUserDelete = async (user: UserData): Promise<void> => {
        try {
            const counter = await database.delete("recipe-stats", ["userId", "==", user.id])

            if (counter > 0) {
                logger.info("Recipes.onUserDelete", logHelper.user(user), `Deleted ${counter} recipe stats`)
            }
        } catch (ex) {
            logger.error("Recipes.onUserDelete", logHelper.user(user), ex)
        }
    }

    // PROCESSING
    // --------------------------------------------------------------------------

    /**
     * Validate a recipe, mostly called before saving to the database.
     * Will throw an error when something wrong is found.
     * @param user The owner of the recipe.
     * @param recipe The recipe object.
     */
    validate = (user: UserData, recipe: RecipeData): void => {
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

            if (recipe.order && isNaN(recipe.order)) {
                throw new Error("Recipe order must be a number")
            }

            if (_.isArray(recipe.actions)) {
                recipe.actions = recipe.actions.filter((a) => !_.isEmpty(a))
                if (recipe.actions.length == 0) {
                    throw new Error("Recipe must have at least one action")
                }
            } else {
                throw new Error("Missing or invalid recipe actions list")
            }

            if (_.isArray(recipe.conditions)) {
                recipe.conditions = recipe.conditions.filter((c) => !_.isEmpty(c))
            }

            // Delete unknown fields.
            const recipeFields = Object.keys(recipe)
            const unknownFields = []
            for (let key of recipeFields) {
                if (!["id", "sharedRecipeId", "title", "conditions", "actions", "order", "op", "samePropertyOp", "defaultFor", "counterProp", "counterNoReset", "killSwitch", "disabled"].includes(key)) {
                    unknownFields.push(key)
                    delete recipe[key]
                }
            }
            if (unknownFields.length > 0) {
                logger.warn("Recipes.validate", logHelper.user(user), recipe.id, `Removing invalid unknown fields: ${unknownFields.join(", ")}`)
            }

            // Default recipes for a specific sport type should have no conditions, and order 0.
            if (recipe.defaultFor) {
                recipe.order = 0
                recipe.conditions = []
            }
            // Non-default recipes must have conditions defined.
            else {
                if (!_.isArray(recipe.conditions) || recipe.conditions.length == 0) {
                    throw new Error("Recipe must have at least one condition")
                }

                // Parse recipe conditions.
                for (let condition of recipe.conditions) {
                    const cValue = condition.value as any

                    if (!condition.property) {
                        throw new Error(`Missing condition property`)
                    }
                    if (!Object.values(RecipeOperator).includes(condition.operator)) {
                        throw new Error(`Invalid condition operator "${condition.operator}"`)
                    }
                    if (cValue === null || cValue === "") {
                        throw new Error(`Missing condition value`)
                    }
                    if (_.isString(cValue) && cValue.length > settings.recipes.maxLength.conditionValue) {
                        throw new Error(`Condition value is too long (max length is ${settings.recipes.maxLength.conditionValue})`)
                    }
                    if (condition.friendlyValue && _.isString(condition.friendlyValue) && (condition.friendlyValue as string).length > settings.recipes.maxLength.conditionValue) {
                        throw new Error(`Condition friendly value is too long (max length is ${settings.recipes.maxLength.conditionValue})`)
                    }

                    // Check valid operators / types.
                    const propSpecs = recipePropertyList.find((p) => p.value == condition.property)
                    if (!propSpecs) {
                        throw new Error(`Condition property "${condition.property}" is not valid`)
                    }
                    if (propSpecs.type == "number" && isNaN(condition.value as any)) {
                        throw new Error(`Condition property "${condition.property}" must be a valid number`)
                    }
                    if (propSpecs.type == "boolean" && ![true, false, 1, 0].includes(condition.value as any)) {
                        throw new Error(`Condition property "${condition.property}" must be a boolean`)
                    }

                    // Check for non-schema fields.
                    const keys = Object.keys(condition)
                    for (let key of keys) {
                        if (!["property", "operator", "value", "friendlyValue"].includes(key)) {
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

                // PRO-only actions.
                if (!user.isPro && [RecipeActionType.GenerateDescription, RecipeActionType.Webhook].includes(action.type)) {
                    throw new Error(`Action ${action.type} is only available to PRO users`)
                }

                // Some actions must have a value.
                if (![RecipeActionType.Commute, RecipeActionType.Trainer, RecipeActionType.GenerateDescription, RecipeActionType.GenerateName, RecipeActionType.GenerateInsights].includes(action.type)) {
                    if (action.value === null || action.value === "") {
                        throw new Error("Missing action value")
                    }
                }

                // Webhook value must be an URL.
                if (action.type == RecipeActionType.Webhook) {
                    const isUrl = /(http|https):\/\/(\w+:{0,1}\w*@)?(\S+)(:[0-9]+)?(\/|\/([\w#!:.?+=&%@!\-\/]))?/.test(action.value)
                    if (!isUrl) {
                        throw new Error(`Webhook URL is not valid`)
                    }
                }

                // Action too long?
                if (action.value && _.isString(action.value) && (action.value as string).length > settings.recipes.maxLength.actionValue) {
                    throw new Error(`Action value is too long (max length is ${settings.recipes.maxLength.actionValue})`)
                }

                // Check for non-schema fields.
                const keys = Object.keys(action)
                for (let key of keys) {
                    if (!["type", "value", "friendlyValue"].includes(key)) {
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
        const debugLogger = user.debug ? logger.warn : logger.debug
        const recipe: RecipeData = user.recipes[id]

        if (!recipe) {
            throw new Error(`Recipe ${id} not found`)
        }

        // Recipe disabled? Stop here.
        if (recipe.disabled) {
            logger.info("Recipes.evaluate", logHelper.user(user), logHelper.activity(activity), logHelper.recipe(recipe), "Recipe is disabled")
            return false
        }

        // Set default logical operators.
        if (!recipe.op) recipe.op = "AND"
        if (!recipe.samePropertyOp) recipe.samePropertyOp = recipe.op
        const operatorLog = recipe.op == recipe.samePropertyOp ? recipe.op : `${recipe.samePropertyOp} ${recipe.op}`

        // If recipe is default for a sport, check the type.
        if (recipe.defaultFor) {
            if (activity.sportType != recipe.defaultFor) {
                return false
            }
        }
        // Otherwise iterate conditions and evaluate each one.
        else {
            logger.info("Recipes.evaluate", logHelper.user(user), logHelper.activity(activity), logHelper.recipe(recipe), operatorLog, "Evaluating")

            // Group conditions by property type, so we can evaluate on an orderly basis
            // and apply the samePropertyOp operator.
            const groupedConditions = Object.entries(_.groupBy(recipe.conditions, "property")) as any
            let gProperty: string
            let conditions: RecipeCondition[]
            let condition: RecipeCondition
            let valid = recipe.op == "OR" ? false : true

            // Evaluate conditions, grouping them by same type.
            for ([gProperty, conditions] of groupedConditions) {
                debugLogger("Recipes.evaluate", logHelper.user(user), logHelper.activity(activity), logHelper.recipe(recipe), `Processing conditions: ${gProperty}`)

                let sameValid = recipe.samePropertyOp == "OR" ? false : true

                // Individual checks, using the logical operator for conditions with same type.
                for (condition of conditions) {
                    if (recipe.samePropertyOp == "OR") {
                        sameValid = sameValid || (await this.checkCondition(user, activity, recipe, condition))
                        if (sameValid) break
                    } else {
                        sameValid = sameValid && (await this.checkCondition(user, activity, recipe, condition))
                        if (!sameValid) break
                    }
                }

                // Logical operator for conditions with different types.
                if (recipe.op == "OR") {
                    valid = valid || sameValid
                    if (valid) break
                } else {
                    valid = valid && sameValid
                    if (!valid) break
                }
            }

            // Recipe not valid for this activity? Log what failed.
            // Polyline contents won't be logged.
            // Dates will be logged considering the activity's timezone offset.
            if (!valid) {
                let conditionProp = condition.property == "polyline" ? null : activity[condition.property]
                if (_.isDate(conditionProp)) {
                    let dateProp = dayjs.utc(conditionProp)
                    const timeLog = dateProp.second() + dateProp.minute() * 60 + dateProp.hour() * 3600
                    conditionProp = `${dateProp.format("lll")} | ${timeLog}, offset ${activity.utcStartOffset} min`
                } else if (_.isArray(conditionProp)) {
                    conditionProp = conditionProp.length
                }

                let logValue = conditionProp ? `Not a match: ${conditionProp}` : "Not a match"
                logger.info("Recipes.evaluate", logHelper.user(user), logHelper.activity(activity), logHelper.recipe(recipe), `${condition.property} ${condition.operator} ${condition.value}`, logValue)
                return false
            }
        }

        const logMapper = (c: RecipeCondition) => `${c.property}: ${activity[c.property] ? activity[c.property].id || (c.property.indexOf("date") == 0 ? dayjs(activity[c.property]).format("lll") : activity[c.property]) : c.value}`
        const logEvaluated = recipe.defaultFor ? `default for ${recipe.defaultFor}` : recipe.conditions.map(logMapper).join(" | ")
        logger.info("Recipes.evaluate", logHelper.user(user), logHelper.activity(activity), logHelper.recipe(recipe), logEvaluated)

        // Sort recipe actions, webhook should come last.
        const sortedActions = _.sortBy(recipe.actions, ["type"])
        const gearwearActions = _.remove(recipe.actions, (a) => a.type.includes("GearComponent"))

        // Execute activity actions first.
        let success: boolean = true
        for (let action of sortedActions) {
            success = success && (await this.processAction(user, activity, recipe, action))
        }

        // Then execute GearWear component actions, processing all GearWear at once before updating them in the database.
        success = success && (await actions.toggleGearComponents(user, activity, recipe, gearwearActions))

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
        const debugLogger = user.debug ? logger.warn : logger.debug

        try {
            const prop = condition.property
            const propDetails = recipePropertyList.find((p) => p.value == prop)

            // Weather conditions.
            if (prop.indexOf("weather") == 0) {
                const valid = await conditions.checkWeather(user, activity, condition)
                if (!valid) return false
            }

            // Garmin and Wahoo conditions (FIT file activities).
            else if (prop.indexOf("garmin") == 0 || prop.indexOf("wahoo") == 0) {
                const valid = await conditions.checkGarminWahoo(user, activity, condition)
                if (!valid) return false
            }

            // Spotify conditions.
            else if (prop.indexOf("spotify") == 0) {
                const valid = await conditions.checkSpotify(user, activity, condition)
                if (!valid) return false
            }

            // Sport type condition.
            else if (prop == "sportType") {
                const valid = conditions.checkSportType(activity, condition)
                if (!valid) return false
            }

            // Gear condition.
            else if (prop == "gear") {
                const valid = conditions.checkGear(activity, condition)
                if (!valid) return false
            }

            // Day of week condition.
            else if (prop == "weekday") {
                const valid = conditions.checkWeekday(activity, condition)
                if (!valid) return false
            }

            // Date range condition.
            else if (prop == "dateRange") {
                const valid = conditions.checkDateRange(activity, condition)
                if (!valid) return false
            }

            // Activity includes specified segment?
            else if (prop == "segmentIncluded") {
                const valid = conditions.checkSegmentIncluded(activity, condition)
                if (!valid) return false
            }

            // New records?
            else if (prop == "newRecords" || prop == "komSegments" || prop == "prSegments") {
                const valid = conditions.checkNewRecords(activity, condition)
                if (!valid) return false
            }

            // Location condition.
            else if (propDetails?.type == "location") {
                const valid = conditions.checkLocation(activity, condition)
                if (!valid) return false
            }

            // Time based condition.
            else if (propDetails?.type == "time") {
                const valid = conditions.checkTimestamp(activity, condition)
                if (!valid) return false
            }

            // First activity of the day condition.
            else if (prop.indexOf("firstOfDay") == 0) {
                const valid = await conditions.checkFirstOfDay(user, activity, condition, recipe)
                if (!valid) return false
            }

            // City conditions.
            else if (prop == "cityStart" || prop == "cityEnd") {
                const valid = await conditions.checkCity(activity, condition)
                if (!valid) return false
            }

            // Boolean condition.
            else if (_.isBoolean(condition.value)) {
                const valid = conditions.checkBoolean(activity, condition)
                if (!valid) return false
            }

            // Number condition.
            else if (_.isNumber(activity[condition.property])) {
                const valid = conditions.checkNumber(activity, condition)
                if (!valid) return false
            }

            // Text condition (default).
            else {
                const valid = conditions.checkText(activity, condition)
                if (!valid) return false
            }

            debugLogger("Recipes.checkCondition", logHelper.user(user), logHelper.activity(activity), logHelper.recipe(recipe), `${condition.property} ${condition.operator} ${condition.value}`)
            return true
        } catch (ex) {
            logger.error("Recipes.checkCondition", logHelper.user(user), logHelper.activity(activity), logHelper.recipe(recipe), `${condition.property} ${condition.operator} ${condition.value}`, ex)
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
        const debugLogger = user.debug ? logger.warn : logger.debug
        debugLogger("Recipes.processAction", logHelper.user(user), logHelper.activity(activity), `${action.type} ${action.value}`)

        if (!activity.updatedFields) {
            activity.updatedFields = []
        }

        // Boolean based actions?
        if (action.type == RecipeActionType.Commute || action.type == RecipeActionType.Trainer || action.type == RecipeActionType.HideHome || action.type.toString().substring(0, 8) == "hideStat") {
            return actions.booleanAction(user, activity, recipe, action)
        }

        // Change activity gear?
        else if (action.type == RecipeActionType.Gear) {
            return actions.gearAction(user, activity, recipe, action)
        }

        // Change activity / sport type?
        else if (action.type == RecipeActionType.SportType) {
            return actions.sportTypeAction(user, activity, recipe, action)
        }

        // Change activity workout type?
        else if (action.type == RecipeActionType.WorkoutType) {
            return actions.workoutTypeAction(user, activity, recipe, action)
        }

        // Change activity map style?
        else if (action.type == RecipeActionType.MapStyle) {
            return actions.mapStyleAction(user, activity, recipe, action)
        }

        // Auto generated activity names?
        else if (action.type == RecipeActionType.GenerateName || action.type == RecipeActionType.GenerateDescription || action.type == RecipeActionType.GenerateInsights) {
            return actions.aiGenerateAction(user, activity, recipe, action)
        }

        // Dispatch activity to webhook?
        else if (action.type == RecipeActionType.Webhook) {
            return actions.webhookAction(user, activity, recipe, action)
        }

        // Other actions (set description or name).
        return actions.replaceTagsAction(user, activity, recipe, action)
    }

    // SHARED RECIPES
    // --------------------------------------------------------------------------

    /**
     * Get all shared recipes owned by the specified user. Only available to PRO users.
     * @param owner The owner of the shared recipes.
     * @param id ID of the shared recipe.
     */
    getUserSharedRecipes = async (owner: UserData): Promise<SharedRecipe[]> => {
        try {
            if (!owner.isPro) {
                return []
            }

            const recipes: SharedRecipe[] = await database.search("shared-recipes", [["userId", "==", owner.id]])
            logger.info("Recipes.getUserSharedRecipes", logHelper.user(owner), `Got ${recipes.length} recipes`)
            return recipes
        } catch (ex) {
            logger.error("Recipes.getUserSharedRecipes", logHelper.user(owner), ex)
            throw ex
        }
    }

    /**
     * Get a shared recipe.
     * @param user User requesting the shared recipe.
     * @param id ID of the shared recipe.
     */
    getSharedRecipe = async (user: UserData, id: string): Promise<SharedRecipe> => {
        try {
            const recipe: SharedRecipe = await database.get("shared-recipes", id)
            if (!recipe) {
                throw new Error(`Recipe ${id} not found`)
            }

            logger.info("Recipes.getSharedRecipe", logHelper.user(user), id, logHelper.recipe(recipe))
            return recipe
        } catch (ex) {
            logger.error("Recipes.getSharedRecipe", logHelper.user(user), id, ex)
            throw ex
        }
    }

    /**
     * Share a recipe with other users by making it public. Returns the created shared recipe.
     * @param owner User sharing the recipe.
     * @param recipe New recipe data or existing shared recipe.
     */
    setSharedRecipe = async (owner: UserData, recipe: RecipeData | SharedRecipe): Promise<SharedRecipe> => {
        try {
            this.validate(owner, recipe)

            // Limited to PRO users only, for now.
            if (!owner.isPro) {
                throw new Error("Only PRO users can share automation recipes")
            }

            const now = new Date()
            const isNew = !recipe.id || recipe.id.substring(0, 1) != "s"

            // Create the shared recipe.
            const sharedRecipe: SharedRecipe = {
                id: isNew ? generateId(true) : recipe.id,
                userId: owner.id,
                title: recipe.title,
                conditions: recipe.conditions,
                actions: recipe.actions,
                dateLastUpdated: now
            }

            // Conditional fields.
            if (recipe.defaultFor) sharedRecipe.defaultFor = recipe.defaultFor
            if (recipe.op) sharedRecipe.op = recipe.op
            if (recipe.samePropertyOp) sharedRecipe.samePropertyOp = recipe.samePropertyOp

            // Save recipe to database.
            await database.set("shared-recipes", sharedRecipe, sharedRecipe.id)
            logger.info("Recipes.setSharedRecipe", logHelper.user(owner), logHelper.recipe(sharedRecipe), isNew ? "Created" : "Updated")

            return sharedRecipe
        } catch (ex) {
            logger.error("Recipes.setSharedRecipe", logHelper.user(owner), logHelper.recipe(recipe), ex)
            throw ex
        }
    }

    /**
     * Delete a shared recipe.
     * @param owner User owner of the shared recipe.
     * @param id ID of the shared recipe to be deleted.
     */
    deleteSharedRecipe = async (owner: UserData, id: string): Promise<void> => {
        try {
            const recipe: SharedRecipe = await database.get("shared-recipes", id)

            // Validate the existing shared recipe.
            if (!recipe) {
                throw new Error(`Recipe ${id} not found`)
            }
            if (recipe.userId != owner.id) {
                throw new Error(`Recipe ${id} does not belong to user ${owner.id}`)
            }

            // Delete it!
            await database.delete("shared-recipes", id)
            logger.info("Recipes.deleteSharedRecipe", logHelper.user(owner), id)
        } catch (ex) {
            logger.error("Recipes.deleteSharedRecipe", logHelper.user(owner), id, ex)
            throw ex
        }
    }

    /**
     * Copy a shared recipe to the user's account.
     * @param user User requesting the shared recipe.
     * @param sharedRecipe The shared recipe data.
     */
    copySharedRecipe = async (user: UserData, sharedRecipe: SharedRecipe): Promise<RecipeData> => {
        try {
            const recipe: RecipeData = {
                id: generateId(),
                sharedRecipeId: sharedRecipe.id,
                title: sharedRecipe.title,
                conditions: sharedRecipe.conditions,
                actions: sharedRecipe.actions
            }

            if (sharedRecipe.defaultFor) recipe.defaultFor = sharedRecipe.defaultFor
            if (sharedRecipe.op) recipe.op = sharedRecipe.op
            if (sharedRecipe.samePropertyOp) recipe.samePropertyOp = sharedRecipe.samePropertyOp

            await database.merge("shared-recipes", {id: sharedRecipe, dateLastCopy: new Date()})
            await database.merge("users", {id: user.id, [`recipes.${recipe.id}`]: recipe})

            logger.info("Recipes.copySharedRecipe", logHelper.user(user), logHelper.recipe(recipe))
            return recipe
        } catch (ex) {
            logger.error("Recipes.copySharedRecipe", logHelper.user(user), ex)
            throw ex
        }
    }
}

// Exports...
export default Recipes.Instance
