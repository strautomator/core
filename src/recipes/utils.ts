// // Strautomator Core: Recipe Utils

import {recipePropertyList, recipeActionList} from "./lists"
import {RecipeAction, RecipeCondition, RecipeData} from "./types"
import _ from "lodash"
import logger from "anyhow"
import dayjs from "../dayjs"

/**
 * Generate a new recipe ID.
 * @param shared If true, the ID will start with "s" instead of "r".
 */
export const generateId = (shared?: boolean): string => {
    const now = dayjs.utc().toDate()
    const hex = Math.round(now.getTime() / 1000).toString(16)
    const prefix = shared ? "s" : "r"
    return prefix + hex.toLowerCase()
}

/**
 * String representation of the recipe.
 * @param recipe The recipe to get the summary for.
 */
export const getSummary = (recipe: RecipeData): string => {
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
export const getActionSummary = (action: RecipeAction): string => {
    try {
        const actionType = _.find(recipeActionList, {value: action.type}).text
        const valueText = action.friendlyValue || action.value

        if (action.value && action.type != "commute") {
            return `${actionType}: ${valueText}`
        } else {
            return `${actionType}`
        }
    } catch (ex) {
        logger.error("Recipes.getActionSummary", action.type, ex)
        return `${action.type}: ${action.value}`
    }
}

/**
 * String representation of a recipe condition.
 * @param condition The recipe condition to get the summary for.
 */
export const getConditionSummary = (condition: RecipeCondition): string => {
    try {
        const property = _.find(recipePropertyList, {value: condition.property})
        const fieldText = property.text

        if (!property.operators) {
            return fieldText
        }

        const operatorText = _.find(property.operators, {value: condition.operator}).text
        let valueText = condition.friendlyValue || condition.value

        if (property.suffix) {
            valueText += ` ${property.suffix}`
        }

        return `${fieldText} ${operatorText} ${valueText}`
    } catch (ex) {
        logger.error("Recipes.getConditionSummary", condition.property, ex)
        return `${condition.property} ${condition.operator} ${condition.value}`
    }
}
