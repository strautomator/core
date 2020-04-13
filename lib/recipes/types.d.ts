/**
 * User's recipe definition.
 */
export interface RecipeData {
    /** Recipe unique ID (inside a user object). */
    id: string;
    /** Title or short description. */
    title: string;
    /** List of conditions to be evaluated. */
    conditions: RecipeCondition[];
    /** List of actions to be executed. */
    actions: RecipeAction[];
    /** How many times the recipe was triggered? */
    triggerCount: number;
}
/**
 * A recipe action to be executed on a Strava activity.
 */
export interface RecipeAction {
    /** Type of action. */
    type: RecipeActionType;
    /** Target action value. */
    value: any;
    /** Friendly display value. */
    friendlyValue?: string;
}
/**
 * A recipe condition with property, operator and target value.
 */
export interface RecipeCondition {
    /** Name of activity property. */
    property: string;
    /** Operator. */
    operator: RecipeOperator;
    /** Target value. */
    value: string | number | boolean;
    /** Friendly display value. */
    friendlyValue?: string;
}
/**
 * Types of recipe actions.
 */
export declare enum RecipeActionType {
    Commute = "commute",
    Name = "name",
    Description = "description",
    Gear = "gear"
}
/**
 * Types of recipe operators.
 */
export declare enum RecipeOperator {
    Equal = "=",
    NotEqual = "!=",
    Like = "like",
    GreaterThan = ">",
    LessThan = "<"
}
