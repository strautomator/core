import { RecipeAction, RecipeData } from "./types";
import { StravaActivity } from "../strava/types";
import { UserData } from "../users/types";
/**
 * Evaluate and process automation recipes.
 */
export declare class Recipes {
    private constructor();
    private static _instance;
    static get Instance(): Recipes;
    /**
     * List of possible property names for conditions.
     */
    get propertyList(): ({
        value: string;
        text: string;
        type: string;
        operators: {
            value: string;
            text: string;
            description: string;
        }[];
        suffix?: undefined;
    } | {
        value: string;
        text: string;
        type: string;
        operators: {
            value: string;
            text: string;
            description: string;
        }[];
        suffix: string;
    })[];
    /**
     * List of possible recipe actions.
     */
    get actionList(): {
        value: string;
        text: string;
    }[];
    /**
     * Validate a recipe, mostly called before saving to the database.
     * Will throw an error when something wrong is found.
     * @param recipe The recipe object.
     */
    validate: (recipe: RecipeData) => void;
    /**
     * Evaluate the activity against the defined conditions and actions,
     * and return the updated Strava activity.
     * @param user The recipe's owner.
     * @param id The recipe ID.
     * @param activity Strava activity to be evaluated.
     */
    evaluate: (user: UserData, id: string, activity: StravaActivity) => Promise<boolean>;
    /**
     * Process a value string against an activity and return the final result.
     * @param activity A Strava activity.
     * @param value The value string template.
     */
    processAction: (user: UserData, activity: StravaActivity, action: RecipeAction) => Promise<void>;
    /**
     * String representation of the recipe.
     * @recipe The recipe to get the summary for.
     */
    getSummary: (recipe: RecipeData) => string;
    /**
     * Increment a recipe's trigger count.
     * @param user The user to have activity count incremented.
     * @param id The recipe ID.
     */
    setTriggerCount: (user: UserData, id: string) => Promise<void>;
    /**
     * Check if the passed location based condition is valid.
     * @param activity The Strava activity to be checked.
     * @param condition The location based recipe condition.
     */
    private checkLocation;
    /**
     * Check if the passed date time based condition is valid.
     * @param activity The Strava activity to be checked.
     * @param condition The date time based recipe condition.
     */
    private checkTimestamp;
    /**
     * Check if the passed number based condition is valid.
     * @param activity The Strava activity to be checked.
     * @param condition The number based recipe condition.
     */
    private checkNumber;
    /**
     * Check if the passed text / string based condition is valid.
     * @param activity The Strava activity to be checked.
     * @param condition The text / string based recipe condition.
     */
    private checkText;
    /**
     * Alert when a specific action has invalid parameters.
     * @param user The recipe's owner.
     * @param action The action with an invalid parameter.
     */
    reportInvalidAction: (user: UserData, action: RecipeAction, message?: string) => void;
}
declare const _default: Recipes;
export default _default;
