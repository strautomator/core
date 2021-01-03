// Strautomator Core: Recipe types

import {StravaSport} from "../strava/types"

/**
 * User's recipe definition.
 */
export interface RecipeData {
    /** Recipe unique ID (inside a user object). */
    id: string
    /** Title or short description. */
    title: string
    /** List of conditions to be evaluated. */
    conditions: RecipeCondition[]
    /** List of actions to be executed. */
    actions: RecipeAction[]
    /** Order of execution (1 executes first, then 2, 3...) */
    order?: number
    /** Default recipe for a specific sport (applies to all incoming activities). */
    defaultFor?: StravaSport
}

/**
 * A recipe action to be executed on a Strava activity.
 */
export interface RecipeAction {
    /** Type of action. */
    type: RecipeActionType
    /** Target action value. */
    value: any
    /** Friendly display value. */
    friendlyValue?: string
}

/**
 * A recipe condition with property, operator and target value.
 */
export interface RecipeCondition {
    /** Name of activity property. */
    property: string
    /** Operator. */
    operator: RecipeOperator
    /** Target value. */
    value: string | number | boolean
    /** Friendly display value. */
    friendlyValue?: string
}

/**
 * Recipe stats saved on the database.
 */
export interface RecipeStatsData {
    /** The ID is on the format of UserID-RecipeID. */
    id: string
    /** User that owns this recipe. */
    userId: string
    /** List of activity IDs that triggered this recipe. */
    activities: number[]
    /** When was it last triggered. */
    dateLastTrigger: Date
    /** Custom counter that can be used on activity name and description. */
    counter?: number
}

/**
 * Types of recipe actions.
 */
export enum RecipeActionType {
    Commute = "commute",
    Name = "name",
    PrependName = "prependName",
    AppendName = "appendName",
    Description = "description",
    PrependDescription = "prependDescription",
    AppendDescription = "appendDescription",
    Gear = "gear",
    Webhook = "webhook"
}

/**
 * Types of recipe operators.
 */
export enum RecipeOperator {
    Equal = "=",
    NotEqual = "!=",
    Like = "like",
    GreaterThan = ">",
    LessThan = "<"
}
