/**
 * List of possible recipe operators for the different data types.
 */
export declare const recipeOperatorList: {
    text: {
        value: string;
        text: string;
        description: string;
    }[];
    number: {
        value: string;
        text: string;
        description: string;
    }[];
    time: {
        value: string;
        text: string;
        description: string;
    }[];
    location: {
        value: string;
        text: string;
        description: string;
    }[];
};
/**
 * List of possible recipe properties, with descriptions and operators.
 */
export declare const recipePropertyList: ({
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
export declare const recipeActionList: {
    value: string;
    text: string;
}[];
