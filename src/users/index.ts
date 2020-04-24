// Strautomator Core: Users

import {UserData} from "./types"
import {StravaProfile, StravaTokens} from "../strava/types"
import {encryptData} from "../database/crypto"
import database from "../database"
import _ = require("lodash")
import logger = require("anyhow")
import moment = require("moment")
const settings = require("setmeup").settings

/**
 * Manage and process user accounts.
 */
export class Users {
    private constructor() {}
    private static _instance: Users
    static get Instance() {
        return this._instance || (this._instance = new this())
    }

    // INIT
    // --------------------------------------------------------------------------

    /**
     * Init the Users manager.
     */
    init = async (): Promise<void> => {
        if (!settings.users.idleDays || settings.users.idleDays < 2) {
            logger.warn("Users.init", "idleDays setting must be at least 2, force setting it to 2 now")
            settings.users.idleDays = 2
        }
    }

    // GET USER DATA
    // --------------------------------------------------------------------------

    /**
     * Return all users on the database.
     */
    getAll = async (): Promise<UserData[]> => {
        try {
            const result = await database.search("users")

            logger.info("Users.getAll", `${result.length} users`)
            return result
        } catch (ex) {
            logger.error("Users.getAll", ex)
            throw ex
        }
    }

    /**
     * Get active users (with at least 1 recipe).
     */
    getActive = async (): Promise<UserData[]> => {
        try {
            const result = await database.search("users", ["recipeCount", ">", 0])

            logger.info("Users.getActive", `${result.length} active users`)
            return result
        } catch (ex) {
            logger.error("Users.getActive", ex)
            throw ex
        }
    }

    /**
     * Get users with recipes defined but with no activities processed for a few days.
     */
    getIdle = async (): Promise<UserData[]> => {
        try {
            const since = moment().subtract(settings.users.idleDays, "days")
            const result = await database.search("users", ["dateLastActivity", "<", since.toDate()])

            // Remove user with no recipes.
            _.remove(result, {recipeCount: 0})

            logger.info("Users.getIdle", `${result.length} idle users`)
            return result
        } catch (ex) {
            logger.error("Users.getIdle", ex)
            throw ex
        }
    }

    /**
     * Get the user by ID.
     * @param id The user's ID.
     */
    getById = async (id: string): Promise<UserData> => {
        try {
            return await database.get("users", id)
        } catch (ex) {
            logger.error("Users.getById", ex)
            throw ex
        }
    }

    /**
     * Get the user for the passed access token.
     * @param accessToken The user's plain-text access token.
     */
    getByToken = async (accessToken: string): Promise<UserData> => {
        try {
            const encryptedToken = encryptData(accessToken)
            const users = await database.search("users", ["stravaTokens.accessToken", "==", encryptedToken])

            if (users.length > 0) {
                return users[0]
            }

            return null
        } catch (ex) {
            logger.error("Users.getByToken", ex)
            throw ex
        }
    }

    // UPDATE USERS
    // --------------------------------------------------------------------------

    /**
     * Create or update user and save its data on database.
     * @param profile Athlete data returned by the Strava API.
     * @param stravaTokens Access and refresh tokens from Strava.
     */
    upsert = async (profile: StravaProfile, stravaTokens: StravaTokens): Promise<UserData> => {
        try {
            const now = new Date()

            const userData: UserData = {
                id: profile.id,
                displayName: profile.username || profile.firstName || profile.lastName || "friend",
                profile: profile,
                stravaTokens: stravaTokens,
                dateLogin: now
            }

            logger.debug("Users.upsert", userData.id, userData)

            // Fetch or create document on database.
            const doc = database.doc("users", profile.id)
            const docSnapshot = await doc.get()
            const exists = docSnapshot.exists

            // Set registration date, if user does not exist yet.
            if (!exists) {
                logger.info("Users.upsert", userData.id, userData.displayName, "New registration")
                userData.dateRegistered = now
                userData.recipes = {}
                userData.recipeCount = 0
                userData.activityCount = 0
            } else {
                const docData = docSnapshot.data()

                if (docData.recipes) {
                    userData.recipeCount = Object.keys(docData.recipes).length
                }
            }

            // Save user to the database.
            await database.merge("users", userData, doc)
            logger.info("Users.upsert", userData.id, userData.displayName, `Has ${userData.recipeCount} recipes`, `Last updated on Strava: ${profile.dateUpdated}`)

            return userData
        } catch (ex) {
            logger.error("Users.upsert", profile.id, ex)
            throw ex
        }
    }

    /**
     * Update the specified user on the database.
     * @param user User to be updated.
     * @param merge Set to true to merge instead of replace data, default is false.
     */
    update = async (user: UserData, merge?: boolean): Promise<void> => {
        try {
            if (merge) {
                await database.merge("users", user)
            } else {
                await database.set("users", user, user.id)
            }
        } catch (ex) {
            if (user.profile) {
                logger.error("Users.update", user.id, user.displayName, ex)
            } else {
                logger.error("Users.update", user.id, ex)
            }

            throw ex
        }
    }

    /**
     * Delete the specified user from the database.
     * @param user User to be deleted.
     */
    delete = async (user: UserData): Promise<void> => {
        try {
            await database.doc("users", user.id).delete()
        } catch (ex) {
            if (user.profile) {
                logger.error("Users.update", user.id, user.displayName, ex)
            } else {
                logger.error("Users.update", user.id, ex)
            }

            throw ex
        }
    }

    /**
     * Increment a user's activity count.
     * @param user The user to have activity count incremented.
     */
    setActivityCount = async (user: UserData): Promise<void> => {
        try {
            await database.increment("users", user.id, "activityCount")
        } catch (ex) {
            logger.error("Users.setActivityCount", user.id, user.displayName, ex)
        }
    }

    // HELPERS
    // --------------------------------------------------------------------------

    /**
     * Check if the passed user has a valid Pro account.
     * @param user The user to be checked.
     */
    isPro = (user: UserData): boolean => {
        const now = new Date()
        return user.dateBilling && user.dateBilling >= now && user.payments.length > 0
    }
}

// Exports...
export default Users.Instance
