"use strict";
// Strautomator Core: Recipe types
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Types of recipe actions.
 */
var RecipeActionType;
(function (RecipeActionType) {
    RecipeActionType["Commute"] = "commute";
    RecipeActionType["Name"] = "name";
    RecipeActionType["Description"] = "description";
    RecipeActionType["Gear"] = "gear";
})(RecipeActionType = exports.RecipeActionType || (exports.RecipeActionType = {}));
/**
 * Types of recipe operators.
 */
var RecipeOperator;
(function (RecipeOperator) {
    RecipeOperator["Equal"] = "=";
    RecipeOperator["NotEqual"] = "!=";
    RecipeOperator["Like"] = "like";
    RecipeOperator["GreaterThan"] = ">";
    RecipeOperator["LessThan"] = "<";
})(RecipeOperator = exports.RecipeOperator || (exports.RecipeOperator = {}));
