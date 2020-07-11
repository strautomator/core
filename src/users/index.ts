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
        if (!settings.users.idleDays || settings.users.idleDays < 7) {
            logger.warn("Users.init", "idleDays setting must be at least 7, force setting it to 7 now")
            settings.users.idleDays = 7
        }

        // PayPal events.
        eventManager.on("PayPal.subscriptionCreated", this.onPayPalSubscription)
        eventManager.on("PayPal.subscriptionUpdated", this.onPayPalSubscription)

        // Strava events.
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
            const subEnabled = subscription.status != "CANCELLED" && subscription.status != "EXPIRED"
            const data: Partial<UserData> = {
                id: subscription.userId,
                subscription: {
                    id: subscription.id,
                    source: "paypal",
                    enabled: subEnabled
                }
            }

            // User activated a PRO account?
            if (subscription.status == "ACTIVE") {
                data.isPro = true
            }

            // Email passed?
            if (subscription.email) {
                data.email = subscription.email
            }

            // Save updated user on the database.
            await this.update(data)
            logger.info("Users.onPayPalSubscription", `User ${subscription.userId}, subscription ${subscription.id}, enabled = ${subEnabled}`)
        } catch (ex) {
            logger.error("Users.onPayPalSubscription", `Failed to update user ${subscription.userId} subscription details`)
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
            const user = await this.getByToken({refreshToken: refreshToken})

            // User not found?
            if (!user) {
                logger.warn("Users.onStravaRefreshToken", `No user found for refresh token ${maskedToken}`)
                return
            }

            // Set previous access token.
            tokens.previousAccessToken = user.stravaTokens.accessToken

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
     * Get users with Strava OAuth tokens expired for longer than 1 day.
     */
    getExpired = async (): Promise<UserData[]> => {
        try {
            const timestamp = moment().subtract(1, "day").unix()
            const result = await database.search("users", ["stravaTokens.expiresAt", "<=", timestamp])

            logger.info("Users.getExpired", `${result.length} users with expired tokens (>= 1 day)`)
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
            const since = moment.utc().subtract(settings.users.idleDays, "days")
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
            logger.error("Users.getById", id, ex)
            throw ex
        }
    }

    /**
     * Get the user for the passed access token.
     * @param tokens The user's Strava access and refrsh token tokens.
     */
    getByToken = async (tokens: StravaTokens): Promise<UserData> => {
        try {
            let users: UserData[]
            let encryptedToken: string

            // Access token was passed?
            if (tokens.accessToken) {
                encryptedToken = encryptData(tokens.accessToken)
                users = await database.search("users", ["stravaTokens.accessToken", "==", encryptedToken])

                if (users.length > 0) {
                    return users[0]
                }

                // Try finding also on the previous access token.
                encryptedToken = encryptData(tokens.accessToken)
                users = await database.search("users", ["stravaTokens.previousAccessToken", "==", encryptedToken])

                if (users.length > 0) {
                    return users[0]
                }
            }

            // Refresh token was passed?
            if (tokens.refreshToken) {
                encryptedToken = encryptData(tokens.refreshToken)
                users = await database.search("users", ["stravaTokens.refreshToken", "==", encryptedToken])

                if (users.length > 0) {
                    return users[0]
                }
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
            const now = moment.utc().toDate()

            const userData: UserData = {
                id: profile.id,
                displayName: profile.username || profile.firstName || profile.lastName || "strava-user",
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
                userData.dateRegistered = now
                userData.recipes = {}
                userData.recipeCount = 0
                userData.activityCount = 0
            }
            // If user exists, update recipe count and gear details.
            else {
                const docData = docSnapshot.data()
                const existingData = docData as UserData

                userData.dateLastActivity = existingData.dateLastActivity

                if (existingData.recipes) {
                    userData.recipeCount = Object.keys(existingData.recipes).length
                }

                // Do not overwrite all gear details, as they won't have brand and model (coming from the athlete endpoint).
                // Merge the bikes and shoes instead.
                for (let bike of userData.profile.bikes) {
                    const existingBike = _.find(existingData.profile.bikes, {id: bike.id})
                    if (existingBike) _.defaults(bike, existingBike)

                    // DEPRECATED! Remove mileage (replaced with distance).
                    delete bike["mileage"]
                }
                for (let shoes of userData.profile.shoes) {
                    const existingShoes = _.find(existingData.profile.shoes, {id: shoes.id})
                    if (existingShoes) _.defaults(shoes, existingShoes)

                    // DEPRECATED! Remove mileage (replaced with distance).
                    delete shoes["mileage"]
                }
            }

            // Save user to the database.
            await database.merge("users", userData, doc)

            // If a new user, publish the user creation event.
            if (!exists) {
                logger.info("Users.upsert", userData.id, userData.displayName, `New registration`)
                eventManager.emit("Users.create", userData)
            } else {
                const dateLastActivity = userData.dateLastActivity ? moment(userData.dateLastActivity).format("ll") : "never"
                logger.info("Users.upsert", userData.id, userData.displayName, `${userData.recipeCount} recipes, last activity: ${dateLastActivity}`)
            }

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
     * Delete the specified user, its activities and automation stats from the database.
     * @param user User to be deleted.
     */
    delete = async (user: UserData): Promise<void> => {
        try {
            if (!user || !user.id || !user.stravaTokens) {
                throw new Error("Missing required user details")
            }

            // Delete user from database first.
            await database.delete("users", user.id)

            // Delete related contents.
            const countActivities = await database.delete("activities", ["user.id", "==", user.id])
            const countRecipeStats = await database.delete("recipe-stats", ["userId", "==", user.id])
            const countGearWear = await database.delete("gearwear", ["userId", "==", user.id])
            logger.warn("Users.delete", user.id, user.displayName, `Removed ${countActivities} activities, ${countRecipeStats} recipe stats, ${countGearWear} gearwear configs`)

            // Publish deleted event.
            eventManager.emit("Users.deleted", user)
        } catch (ex) {
            logger.error("Users.delete", user.id, user.displayName, ex)
            throw ex
        }
    }

    /**
     * Update the email address of the specified user.
     * @param user User to be updated.
     * @param email The new email address of the user.
     */
    setEmail = async (user: UserData, email: string): Promise<void> => {
        try {
            const validator = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/

            // New email is mandatory.
            if (!email) {
                throw new Error("Missing email address")
            }

            email = email.trim().toLowerCase()

            // Validate email address.
            if (!validator.test(email)) {
                throw new Error("Invalid email address")
            }

            // Make sure email has changed before proceeding. If not, stop here.
            if (user.email && user.email == email) {
                logger.warn("Users.setEmail", user.id, `Email ${email} hasn't changed`)
                return
            }

            // Make sure email is unique in the database.
            const existing = await database.search("users", ["email", "==", email])
            if (existing.length > 0) {
                throw new Error(`Email ${email} in use by another user`)
            }

            // Save new email address.
            const data: Partial<UserData> = {
                id: user.id,
                email: email
            }
            await database.merge("users", data)

            logger.info("Users.setEmail", user.id, user.displayName, email)
        } catch (ex) {
            if (user.profile) {
                logger.error("Users.setEmail", user.id, user.displayName, email, ex)
            } else {
                logger.error("Users.setEmail", user.id, email, ex)
            }

            throw ex
        }
    }

    /**
     * Increment a user's activity count (how many activities were processed).
     * @param user The user to have activity count incremented.
     */
    setActivityCount = async (user: UserData): Promise<void> => {
        try {
            await database.increment("users", user.id, "activityCount")
            logger.info("Users.setActivityCount", user.id, `Activity count: ${user.activityCount + 1}`)
        } catch (ex) {
            logger.error("Users.setActivityCount", user.id, user.displayName, ex)
        }
    }

    /**
     * Set the recipes ordering.
     * @param user The user.
     */
    setRecipesOrder = async (user: UserData, recipesOrder: {[id: string]: number}): Promise<void> => {
        try {
            const data = {id: user.id, recipes: {}}
            const logOrder = []

            if (!recipesOrder) {
                throw new Error("Missing recipes ordering object")
            }

            // Update the order for each recipe passed.
            for (let [id, order] of Object.entries(recipesOrder)) {
                if (!user.recipes[id]) {
                    throw new Error(`Recipe ${id} does not exist`)
                }
                if (!_.isNumber(order)) {
                    throw new Error(`Invalid order number: ${order}`)
                }

                data.recipes[id] = {order: order}
                logOrder.push(`${id}=${order}`)
            }

            await this.update(data)
            logger.info("Users.setRecipesOrder", user.id, user.displayName, logOrder.join(", "))
        } catch (ex) {
            logger.error("Users.setRecipesOrder", user.id, user.displayName, ex)
            throw ex
        }
    }
}

// Exports...
export default Users.Instance
