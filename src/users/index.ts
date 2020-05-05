// Strautomator Core: Users

import {UserData} from "./types"
import {PayPalSubscription} from "../paypal/types"
import {StravaProfile, StravaTokens} from "../strava/types"
import {encryptData} from "../database/crypto"
import database from "../database"
import eventManager from "../eventmanager"
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

        eventManager.on("PayPal.subscriptionUpdated", this.onPayPalSubscription)
        eventManager.on("Strava.refreshToken", this.onStravaRefreshToken)
    }

    /**
     * Set user isPro status when a PayPal subscription status changes.
     * @param subscription The PayPal ssubscription details.
     */
    private onPayPalSubscription = async (subscription: PayPalSubscription): Promise<void> => {
        if (!subscription) {
            logger.error("Users.onPayPalSubscription", "Missing subscription data")
            return
        }

        try {
            const isPro = subscription.status == "ACTIVE"
            await this.update({id: subscription.userId, isPro: isPro})

            logger.info("Users.onPayPalSubscription", `User ${subscription.userId}, isPro = ${isPro}`)
        } catch (ex) {
            logger.error("Users.onPayPalSubscription", `Failed to update user ${subscription.userId} isPro status`)
        }
    }

    /**
     * Update Strava tokens on user's document when they are refreshed.
     * @param refreshToken The original refresh token.
     * @param tokens The updated Strava tokens.
     */
    private onStravaRefreshToken = async (refreshToken: string, tokens: StravaTokens): Promise<void> => {
        if (!refreshToken) {
            logger.error("Users.onStravaRefreshToken", "Missing refresh token")
            return
        }

        // Masked token used on warning logs.
        const maskedToken = `${refreshToken.substring(0, 3)}***${refreshToken.substring(refreshToken.length - 1)}`

        try {
            const user = await this.getByToken(refreshToken, true)

            // User not found?
            if (!user) {
                logger.warn("Users.onStravaRefreshToken", `No user found for refresh token ${maskedToken}`)
                return
            }

            // Updated user info.
            const updatedUser: Partial<UserData> = {
                id: user.id,
                stravaTokens: tokens
            }

            await this.update(updatedUser as UserData)
        } catch (ex) {
            logger.error("Users.onStravaRefreshToken", `Failed to update user tokens for original refresh token ${maskedToken}`)
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
     * Get users with expired Strava OAuth tokens.
     */
    getExpired = async (): Promise<UserData[]> => {
        try {
            const now = moment().unix()
            const result = await database.search("users", ["stravaTokens.expiresAt", "<=", now])

            logger.info("Users.getExpired", `${result.length} users with expired tokens`)
            return result
        } catch (ex) {
            logger.error("Users.getExpired", ex)
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
     * @param isBoolean Get by refresh token instead of access token.
     */
    getByToken = async (accessToken: string, isRefresh?: boolean): Promise<UserData> => {
        try {
            const encryptedToken = encryptData(accessToken)
            const field = isRefresh ? "stravaTokens.refreshToken" : "stravaTokens.accessToken"
            const users = await database.search("users", [field, "==", encryptedToken])

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

                // TODO! Migrate stravaSubscription to stravaWebhook.
                if (docData.stravaSubscription) {
                    userData.stravaWebhook = docData.stravaSubscription
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
     * @param merge Set to true to fully replace data instead of merging, default is false.
     */
    update = async (user: Partial<UserData>, replace?: boolean): Promise<void> => {
        try {
            if (!replace) {
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

            // Publish delete event.
            eventManager.emit("Users.delete", user)
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
}

// Exports...
export default Users.Instance
