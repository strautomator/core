// Strautomator Core: Users

import {UserData} from "./types"
import {PayPalSubscription} from "../paypal/types"
import {StravaProfile, StravaTokens} from "../strava/types"
import {encryptData} from "../database/crypto"
import userSubscriptions from "./subscriptions"
import database from "../database"
import eventManager from "../eventmanager"
import mailer from "../mailer"
import _ = require("lodash")
import logger = require("anyhow")
import dayjs from "../dayjs"
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

    /**
     * User subscriptions.
     */
    subscriptions = userSubscriptions

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
        eventManager.on("Strava.tokenFailure", this.onStravaTokenFailure)
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

        logger.info("Users.onPayPalSubscription", `User ${subscription.userId}`, subscription.id, subscription.status)

        try {
            const user: Partial<UserData> = {id: subscription.userId}

            // User activated a PRO account or reverted back to the free plan?
            if (subscription.status == "ACTIVE") {
                await this.switchToPro(user, subscription)
            } else {
                user.subscription = {
                    id: subscription.id,
                    source: "paypal",
                    enabled: subscription.status != "CANCELLED"
                }

                await this.update(user)
            }
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
        const maskedToken = `${refreshToken.substring(0, 2)}***${refreshToken.substring(refreshToken.length - 2)}`

        try {
            let user = await this.getByToken({refreshToken: refreshToken})

            // User not found with old refresh token? Try the current one.
            if (!user && refreshToken != tokens.refreshToken) {
                user = await this.getByToken({refreshToken: tokens.refreshToken})
            }

            // User not found?
            if (!user) {
                logger.warn("Users.onStravaRefreshToken", `No user found for refresh token ${maskedToken}`)
                return
            }

            // Set previous access token.
            if (user.stravaTokens.accessToken != tokens.accessToken) {
                tokens.previousAccessToken = user.stravaTokens.accessToken
            }

            // Updated user info.
            const updatedUser: Partial<UserData> = {
                id: user.id,
                displayName: user.displayName,
                stravaTokens: tokens,
                reauth: 0
            }

            await this.update(updatedUser as UserData)
        } catch (ex) {
            logger.error("Users.onStravaRefreshToken", `Failed to update user tokens for original refresh token ${maskedToken}`)
        }
    }

    /**
     * When a refresh token has expired, check if user has an email address and contact asking to login again.
     * @param token The expired or invalid Strava auth token.
     * @param refresh Is it a refresh token?
     */
    private onStravaTokenFailure = async (token: string, refresh?: boolean): Promise<void> => {
        if (!token) {
            logger.error("Users.onStravaTokenFailure", "Missing token")
            return
        }

        // Masked token used on warning logs.
        const maskedToken = `${token.substring(0, 2)}***${token.substring(token.length - 2)}`

        try {
            const byToken: StravaTokens = refresh ? {refreshToken: token} : {accessToken: token}
            const user = await this.getByToken(byToken)
            if (!user) {
                logger.warn("Users.onStravaMissingPermission", `No user found for token ${maskedToken}`)
                return
            }

            // Increment the reauth counter.
            if (!user.reauth) user.reauth = 0
            user.reauth++

            const updatedUser: Partial<UserData> = {id: user.id, displayName: user.displayName, reauth: user.reauth}
            logger.warn("Strava.onStravaTokenFailure", `User ${user.id} ${user.displayName}`, `Reauth count: ${user.reauth}`)

            // User has an email address? Contact asking to connect to Strautomator again,
            // and if it fails too many times, disable the user.
            if (user.email && user.reauth == settings.oauth.tokenFailuresAlert) {
                const data = {
                    userId: user.id,
                    userName: user.profile.firstName || user.displayName
                }
                const options = {
                    to: user.email,
                    template: "StravaTokenExpired",
                    data: data
                }

                // Send email in async mode (no need to wait).
                mailer.send(options)
            } else if (user.reauth >= settings.oauth.tokenFailuresDisable) {
                logger.warn("Users.onStravaTokenFailure", `User ${user.id} ${user.displayName} will be suspended due to too many token failures`)
                await this.suspend(user)
            }

            await this.update(updatedUser)
        } catch (ex) {
            logger.error("Users.onStravaTokenFailure", `Failed to email user about invalid token ${maskedToken}`)
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
            const timestamp = dayjs().subtract(1, "day").unix()
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
            const since = dayjs.utc().subtract(settings.users.idleDays, "days")
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
     * @param userId Optional user ID to log in case it fails.
     */
    getByToken = async (tokens: StravaTokens, userId?: string): Promise<UserData> => {
        try {
            let users: UserData[]
            let encryptedToken: string

            // Access token was passed?
            if (tokens.accessToken) {
                encryptedToken = encryptData(tokens.accessToken)
                users = await database.search("users", ["stravaTokens.accessToken", "==", encryptedToken])

                if (users.length > 0) {
                    const maskedToken = `${tokens.accessToken.substring(0, 2)}***${tokens.accessToken.substring(tokens.accessToken.length - 2)}`
                    logger.debug("Users.getByToken", `Found ${users[0].id} - ${users[0].displayName} by current token ${maskedToken}`)

                    return users[0]
                }

                // Try finding also on the previous access token.
                users = await database.search("users", ["stravaTokens.previousAccessToken", "==", encryptedToken])

                if (users.length > 0) {
                    const maskedToken = `${tokens.accessToken.substring(0, 2)}***${tokens.accessToken.substring(tokens.accessToken.length - 2)}`
                    logger.debug("Users.getByToken", `Found ${users[0].id} - ${users[0].displayName} by previous token ${maskedToken}`)

                    return users[0]
                }
            }

            // Refresh token was passed? Try getting user with that refresh token.
            if (tokens.refreshToken) {
                encryptedToken = encryptData(tokens.refreshToken)
                users = await database.search("users", ["stravaTokens.refreshToken", "==", encryptedToken])

                if (users.length > 0) {
                    const maskedToken = `${tokens.refreshToken.substring(0, 2)}***${tokens.refreshToken.substring(tokens.refreshToken.length - 2)}`
                    logger.info("Users.getByToken", `Found ${users[0].id} - ${users[0].displayName} by refresh token ${maskedToken}`)

                    return users[0]
                }
            }

            if (userId) {
                logger.warn("Users.getByToken", `User ${userId} not found by token`)
            }

            return null
        } catch (ex) {
            logger.error("Users.getByToken", ex)
            throw ex
        }
    }

    /**
     * Get list of users that should have their recipe counters reset on the specified date.
     * @param resetDate Target reset date.
     */
    getByResetCounter = async (resetDate: Date): Promise<UserData[]> => {
        const dateFormat = dayjs(resetDate).format("MM-DD")

        try {
            if (!resetDate) throw new Error("Missing reset date")

            const where = [["preferences.dateResetCounter", "==", dateFormat]]
            const users = await database.search("users", where)

            logger.info("Users.getByResetCounter", dateFormat, `Got ${users.length || "no"} users`)
            return users
        } catch (ex) {
            logger.error("Users.getByResetCounter", dateFormat, ex)
            throw ex
        }
    }

    // UPDATE USERS
    // --------------------------------------------------------------------------

    /**
     * Create or update user and save its data on database.
     * @param profile Athlete data returned by the Strava API.
     * @param stravaTokens Access and refresh tokens from Strava.
     * @param login Triggered via user login?
     */
    upsert = async (profile: StravaProfile, stravaTokens: StravaTokens, login?: boolean): Promise<UserData> => {
        try {
            const now = dayjs.utc().toDate()

            const userData: UserData = {
                id: profile.id,
                profile: profile,
                stravaTokens: stravaTokens,
                dateLogin: now,
                reauth: 0
            }

            // Fetch or create document on database.
            const doc = database.doc("users", profile.id)
            const docSnapshot = await doc.get()
            const exists = docSnapshot.exists

            // Set registration date, if user does not exist yet.
            if (!exists) {
                userData.displayName = profile.username || profile.firstName || profile.lastName
                userData.dateRegistered = now
                userData.preferences = {}
                userData.recipes = {}
                userData.recipeCount = 0
                userData.activityCount = 0
                userData.urlToken = require("crypto").randomBytes(12).toString("hex")
            }
            // If user exists, update recipe count and gear details.
            else {
                const docData = docSnapshot.data()
                const existingData = docData as UserData

                userData.dateLastActivity = existingData.dateLastActivity

                if (existingData.recipes) {
                    userData.recipeCount = Object.keys(existingData.recipes).length
                }

                // User has changed the access token? Update the previous one.
                if (stravaTokens.accessToken != existingData.stravaTokens.accessToken) {
                    userData.stravaTokens.previousAccessToken = stravaTokens.accessToken
                }

                // Do not overwrite all gear details, as they won't have brand and model (coming from the athlete endpoint).
                // Merge the bikes and shoes instead.
                for (let bike of userData.profile.bikes) {
                    const existingBike = _.find(existingData.profile.bikes, {id: bike.id})
                    if (existingBike) _.defaults(bike, existingBike)
                }
                for (let shoes of userData.profile.shoes) {
                    const existingShoes = _.find(existingData.profile.shoes, {id: shoes.id})
                    if (existingShoes) _.defaults(shoes, existingShoes)
                }

                // User has opted for the privacy mode?
                if (existingData.preferences.privacyMode) {
                    delete userData.profile.username
                    delete userData.profile.firstName
                    delete userData.profile.lastName
                    delete userData.profile.city
                    userData.displayName = existingData.displayName
                } else {
                    userData.displayName = profile.username || profile.firstName || profile.lastName
                }

                // Triggered via user login? Force reset the suspended flag.
                if (login) {
                    if (userData.suspended) {
                        logger.error("Users.upsert", `${userData.id} ${userData.displayName}`, "Reactivated, suspended = false")
                    }

                    userData.suspended = false
                }
            }

            // Save user to the database.
            await database.merge("users", userData, doc)

            // If a new user, publish the user creation event.
            if (!exists) {
                logger.info("Users.upsert", `${userData.id} ${userData.displayName}`, `New registration`)
                eventManager.emit("Users.create", userData)
            } else {
                logger.info("Users.upsert", `${userData.id} ${userData.displayName}`, "Updated")
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
        const username = user.displayName ? `${user.id} ${user.displayName}` : user.id

        try {
            const logs = []

            if (!replace) {
                if (user.profile) {
                    user.displayName = user.profile.username || user.profile.firstName || user.profile.lastName
                }

                // Update user on the database.
                await database.merge("users", user)

                // Check updated properties which should be logged.
                if (user.suspended) {
                    logs.push("Suspended")
                }
                if (user.dateLastActivity) {
                    logs.push(dayjs(user.dateLastActivity).format("lll"))
                }
                if (user.dateLastFtpUpdate) {
                    logs.push("FTP")
                }
                if (user.calendarTemplate) {
                    logs.push("Calendar template")
                }
                if (user.stravaTokens) {
                    logs.push("Strava tokens")
                }
                if (user.profile) {
                    if (user.profile.bikes && user.profile.bikes.length > 0) {
                        logs.push("Bikes")
                    }
                    if (user.profile.shoes && user.profile.shoes.length > 0) {
                        logs.push("Shoes")
                    }
                }
                if (user.preferences) {
                    logs.push(_.toPairs(user.preferences).join(" | ").replace(/\,/gi, "="))
                }
            } else {
                await database.set("users", user, user.id)
                logs.push("Replaced entire user data")
            }

            logger.info("Users.update", username, logs.length > 0 ? logs.join(" | ") : "Updated")
        } catch (ex) {
            logger.error("Users.update", username, ex)
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
            logger.warn("Users.delete", `User ${user.id} ${user.displayName}`, `${user.isPro ? "PRO" : "Free"} account deleted`)

            // Publish delete event so related contents can be removed as well.
            eventManager.emit("Users.delete", user)
        } catch (ex) {
            logger.error("Users.delete", user.id, user.displayName, ex)
            throw ex
        }
    }

    /**
     * Suspend / deactivate the specified user.
     * @param user The user to be deactivate.
     */
    suspend = async (user: UserData): Promise<void> => {
        try {
            await database.merge("users", {id: user.id, suspended: true})
            logger.info("Users.suspend", user.id, user.displayName)
        } catch (ex) {
            logger.error("Users.suspend", user.id, user.displayName, ex)
        }
    }

    /**
     * Replace user name with a random value.
     * @param user The user to be anonymized.
     */
    anonymize = (user: UserData | Partial<UserData>): void => {
        if (!user.profile) user.profile = {} as any
        const firstNames = ["Chair", "Table", "Ball", "Wheel", "Flower", "Sun", "Globe", "January", "Dry", "Chain", "High"]
        const lastNames = ["Winter", "McGyver", "Second", "Tequila", "Whiskey", "Wine", "House", "Light", "Fast", "Rock"]

        user.displayName = "anonymous"
        user.profile.username = "anonymous"
        user.profile.firstName = _.sample(firstNames)
        user.profile.lastName = _.sample(lastNames)
        user.profile.city = "Atlantis"
        delete user.profile.urlAvatar

        logger.info("Users.anonymize", user.id, `${user.profile.firstName} ${user.profile.lastName}`)
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
                    throw new Error(`Invalid order number ${order} for recipe ${id}`)
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
    } // VALIDATION
    // --------------------------------------------------------------------------

    /**
     * Validate user preferences, and revert invalid values to their defaults.
     * @param user User to be validated.
     */
    validatePreferences = (user: Partial<UserData>): void => {
        try {
            const fields = []
            const weatherKeys = Object.keys(settings.weather)

            if (!user.isPro) {
                if (!_.isNil(user.preferences.linksOn) && (user.preferences.linksOn < 1 || user.preferences.linksOn > 10)) {
                    fields.push(`linksOn: ${user.preferences.linksOn}`)
                    user.preferences.linksOn = settings.plans.free.linksOn
                }

                if (!_.isNil(user.preferences.ftpAutoUpdate) && user.preferences.ftpAutoUpdate) {
                    fields.push(`ftpAutoUpdate: ${user.preferences.ftpAutoUpdate}`)
                    user.preferences.ftpAutoUpdate = false
                }
            }

            if (!_.isNil(user.preferences.gearwearDelayDays) && (user.preferences.gearwearDelayDays < 1 || user.preferences.gearwearDelayDays > 3)) {
                fields.push(`gearwearDelayDays: ${user.preferences.gearwearDelayDays}`)
                user.preferences.gearwearDelayDays = 2
            }

            if (!_.isNil(user.preferences.weatherProvider) && user.preferences.weatherProvider && !weatherKeys.includes(user.preferences.weatherProvider)) {
                fields.push(`weatherProvider: ${user.preferences.weatherProvider}`)
                user.preferences.weatherProvider = _.sample(settings.weather.defaultProviders)
            }

            if (!_.isNil(user.preferences.dateResetCounter) && user.preferences.dateResetCounter && !user.preferences.dateResetCounter.includes("-")) {
                fields.push(`dateResetCounter: ${user.preferences.dateResetCounter}`)
                user.preferences.dateResetCounter = false
            }

            if (fields.length > 0) {
                logger.warn("Users.validatePreferences", user.id, user.displayName, "Invalid fields reverted to default", `${fields.join(", ")}`)
            }
        } catch (ex) {
            logger.error("Users.validatePreferences", user.id, user.displayName, ex)
        }
    }

    // SWITCHING SUBSCRIPTIONS
    // --------------------------------------------------------------------------

    /**
     * Switch the specified user to the PRO plan.
     * @param user Data for the user that should be updated.
     * @param subscription Optional subscription that was created, otherwise default to a "friend" subscription.
     */
    switchToPro = async (user: Partial<UserData>, subscription?: PayPalSubscription): Promise<void> => {
        try {
            const existingUser = await this.getById(user.id)

            // Set PRO flag and subscription details.
            user.displayName = existingUser.displayName
            user.isPro = true
            user.subscription = {
                id: subscription ? subscription.id : `F-${dayjs().unix()}`,
                source: subscription ? "paypal" : "friend",
                enabled: true
            }

            // Email passed with the subscription and was not set for that user? Set it now.
            if (!existingUser.email && subscription && subscription.email) {
                user.email = subscription.email
            }

            // Update user on the database.
            await this.update(user)

            const email = user.email || existingUser.email

            // User was on the free plan before? Send a thanks email.
            if (email && !existingUser.isPro) {
                const data = {
                    userId: user.id,
                    userName: user.profile.firstName || user.displayName,
                    subscriptionId: user.subscription.id,
                    subscriptionSource: user.subscription.source
                }
                const options = {
                    to: user.email,
                    template: "UpgradedToPro",
                    data: data
                }

                // Send upgraded email in async mode (no need to wait).
                mailer.send(options)
            }

            logger.info("Users.switchToPro", user.id, user.displayName, `Subscription: ${user.subscription.source} ${user.subscription.id}`)
        } catch (ex) {
            logger.error("Users.switchToPro", user.id, user.displayName, ex)
            throw ex
        }
    }

    /**
     * Switch the specified to the free plan.
     * @param user Data for the user that should be updated.
     * @param subscription Optional subscription that was deactivated.
     */
    switchToFree = async (user: Partial<UserData>, subscription?: PayPalSubscription): Promise<void> => {
        try {
            const existingUser = await this.getById(user.id)

            // Remove the PRO flag.
            user.displayName = existingUser.displayName
            user.isPro = false

            // User had a previous subscription set? Mark as disabled.
            if (existingUser.subscription) {
                existingUser.subscription.enabled = false
                user.subscription = existingUser.subscription
            }

            // Update user on the database.
            await this.update(user)

            const email = user.email || existingUser.email
            const status = subscription ? subscription.status.toLowerCase() : "cancelled"

            // User had a valid PRO subscription before? Send an email about the downgrade.
            if (email && existingUser.isPro) {
                const data = {
                    userId: user.id,
                    userName: user.profile.firstName || user.displayName,
                    subscriptionId: user.subscription.id,
                    subscriptionSource: user.subscription.source,
                    subscriptionStatus: status
                }
                const options = {
                    to: user.email,
                    template: "DowngradedToFree",
                    data: data
                }

                // Send downgraded email in async mode (no need to wait).
                mailer.send(options)
            }

            logger.info("Users.switchToFree", user.id, user.displayName, `Subscription: ${user.subscription.source} ${user.subscription.id} - ${status}`)
        } catch (ex) {
            logger.error("Users.switchToFree", user.id, user.displayName, ex)
            throw ex
        }
    }
}

// Exports...
export default Users.Instance
