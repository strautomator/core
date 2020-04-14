"use strict";
// Strautomator Core: Users
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const crypto_1 = require("../database/crypto");
const database_1 = __importDefault(require("../database"));
const _ = require("lodash");
const logger = require("anyhow");
const moment = require("moment");
const settings = require("setmeup").settings;
/**
 * Manage and process user accounts.
 */
class Users {
    constructor() {
        // GET USER DATA
        // --------------------------------------------------------------------------
        /**
         * Return all users on the database.
         */
        this.getAll = async () => {
            try {
                const result = await database_1.default.search("users");
                logger.info("Users.getAll", `${result.length} users`);
                return result;
            }
            catch (ex) {
                logger.error("Users.getAll", ex);
                throw ex;
            }
        };
        /**
         * Get users with recipes and that haven't received
         * activity updates on for more than a few days.
         */
        this.getIdle = async () => {
            try {
                const since = moment().subtract(settings.users.idleDays, "days");
                const result = await database_1.default.search("users", ["dateLastActivity", "<", since.toDate()]);
                // Remove user with no recipes.
                _.remove(result, { recipeCount: 0 });
                logger.info("Users.getIdle", `${result.length} idle users`);
                return result;
            }
            catch (ex) {
                logger.error("Users.getIdle", ex);
                throw ex;
            }
        };
        /**
         * Get the user by ID.
         * @param id The user's ID.
         */
        this.getById = async (id) => {
            try {
                return await database_1.default.get("users", id);
            }
            catch (ex) {
                logger.error("Users.getById", ex);
                throw ex;
            }
        };
        /**
         * Get the user for the passed access token.
         * @param accessToken The user's plain-text access token.
         */
        this.getByToken = async (accessToken) => {
            try {
                const encryptedToken = crypto_1.encryptData(accessToken);
                const users = await database_1.default.search("users", ["stravaTokens.accessToken", "==", encryptedToken]);
                if (users.length > 0) {
                    return users[0];
                }
                return null;
            }
            catch (ex) {
                logger.error("Users.getByToken", ex);
                throw ex;
            }
        };
        // UPDATE USERS
        // --------------------------------------------------------------------------
        /**
         * Create or update user and save its data on database.
         * @param profile Athlete data returned by the Strava API.
         * @param stravaTokens Access and refresh tokens from Strava.
         */
        this.upsert = async (profile, stravaTokens) => {
            try {
                const now = new Date();
                const userData = {
                    id: profile.id,
                    profile: profile,
                    stravaTokens: stravaTokens,
                    dateLogin: now
                };
                logger.debug("Users.upsert", profile.id, profile.username, userData);
                // Fetch or create document on database.
                const doc = database_1.default.doc("users", profile.id);
                const exists = (await doc.get()).exists;
                // Set registration date, if user does not exist yet.
                if (!exists) {
                    logger.debug("Users.upsert", profile.id, profile.username, "New user will be created");
                    userData.dateRegistered = now;
                    userData.recipes = {};
                    userData.recipeCount = 0;
                    userData.activityCount = 0;
                }
                else {
                    if (userData.recipes) {
                        userData.recipeCount = Object.keys(userData.recipes).length;
                    }
                }
                // Save user to the database.
                await database_1.default.merge("users", userData, doc);
                const profileSummary = `Has ${profile.bikes.length} bikes, ${profile.shoes.length} shoes, updated: ${profile.dateUpdated}`;
                logger.info("Users.upsert", profile.id, profile.username, profileSummary);
                return userData;
            }
            catch (ex) {
                logger.error("Users.upsert", profile.id, profile.username, ex);
                throw ex;
            }
        };
        /**
         * Update the specified user on the database.
         * @param user User to be updated.
         * @param merge Set to true to merge instead of replace data, default is false.
         */
        this.update = async (user, merge) => {
            try {
                if (merge) {
                    await database_1.default.merge("users", user);
                }
                else {
                    await database_1.default.set("users", user, user.id);
                }
            }
            catch (ex) {
                if (user.profile) {
                    logger.error("Users.update", user.id, user.profile.username, ex);
                }
                else {
                    logger.error("Users.update", user.id, ex);
                }
                throw ex;
            }
        };
        /**
         * Delete the specified user from the database.
         * @param user User to be deleted.
         */
        this.delete = async (user) => {
            try {
                await database_1.default.doc("users", user.id).delete();
            }
            catch (ex) {
                if (user.profile) {
                    logger.error("Users.update", user.id, user.profile.username, ex);
                }
                else {
                    logger.error("Users.update", user.id, ex);
                }
                throw ex;
            }
        };
        /**
         * Increment a user's activity count.
         * @param user The user to have activity count incremented.
         */
        this.setActivityCount = async (user) => {
            try {
                await database_1.default.increment("users", user.id, "activityCount");
            }
            catch (ex) {
                logger.error("Users.setActivityCount", user.id, user.profile.username, ex);
            }
        };
    }
    static get Instance() {
        return this._instance || (this._instance = new this());
    }
}
exports.Users = Users;
// Exports...
exports.default = Users.Instance;
