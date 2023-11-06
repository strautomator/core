// Strautomator Core: Users

import {validateUserPreferences} from "./utils"
import {UserData} from "../users/types"
import {BaseSubscription} from "../subscriptions/types"
import {AuthNotification} from "../notifications/types"
import {PayPalSubscription} from "../paypal/types"
import {GitHubSubscription} from "../github/types"
import {StravaProfile, StravaTokens} from "../strava/types"
import {encryptData} from "../database/crypto"
import {FieldValue} from "@google-cloud/firestore"
import database from "../database"
import eventManager from "../eventmanager"
import mailer from "../mailer"
import notifications from "../notifications"
import subscriptions from "../subscriptions"
import _ from "lodash"
import crypto from "crypto"
import logger from "anyhow"
import * as logHelper from "../loghelper"
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
     * List of ignored user IDs.
     */
    ignoredUserIds: string[] = []

    /**
     * Shortcut to validate user preferences.
     */
    validatePreferences = validateUserPreferences

    // INIT
    // --------------------------------------------------------------------------

    /**
     * Init the Users manager. Listen to PayPal, GitHub and Strava events.
     * @param quickStart If true, will not manage list of ignored users.
     */
    init = async (quickStart?: boolean): Promise<void> => {
        if (!quickStart) {
            const dbUsers = await database.appState.get("users")
            if (dbUsers?.ignored) {
                dbUsers.ignored.forEach((id) => this.ignoredUserIds.push(id))
            }
            if (this.ignoredUserIds.length > 0) {
                logger.info("Users.init", `Currently ignoring ${this.ignoredUserIds.length} users`)
            }
        }

        eventManager.on("PayPal.subscriptionCreated", this.onSubscription)
        eventManager.on("PayPal.subscriptionUpdated", this.onSubscription)
        eventManager.on("GitHub.subscriptionUpdated", this.onSubscription)
        eventManager.on("Strava.missingPermission", this.onStravaMissingPermission)
        eventManager.on("Strava.refreshToken", this.onStravaRefreshToken)
        eventManager.on("Strava.tokenFailure", this.onStravaTokenFailure)
        eventManager.on("Spotify.tokenFailure", this.onSpotifyTokenFailure)
    }

    /**
     * Set user isPro status depending on the subscription status.
     * @param subscription The PayPal subscription details.
     */
    private onSubscription = async (subscription: GitHubSubscription | PayPalSubscription): Promise<void> => {
        if (!subscription) {
            logger.error("Users.onSubscription", "Missing subscription data")
            return
        }

        logger.info("Users.onSubscription", `User ${subscription.userId}`, subscription.id, subscription.status)

        try {
            const now = dayjs.utc()
            const user = await this.getById(subscription.userId)

            // User not found? Stop here.
            if (!user) {
                logger.warn("Users.onSubscription", `User ${subscription.userId} not found`, `Reference subscription: ${subscription.id}`)
                return
            }

            // Switch to PRO if subscription is active, or back to free if it has expired.
            if (!user.isPro && subscription.status == "ACTIVE") {
                await this.switchToPro(user, subscription)
            } else if (user.isPro && subscription.dateExpiry && now.isAfter(subscription.dateExpiry)) {
                await this.switchToFree(user, subscription)
            }
        } catch (ex) {
            logger.error("Users.onSubscription", `Failed to update user ${subscription.userId} subscription ${subscription.id} details`, ex)
        }
    }

    /**
     * When user hasn't authorized Strautomator to write to the Strava account.
     * @param tokens Set of Strava tokens that failed due to missing permissions.
     */
    private onStravaMissingPermission = async (tokens: StravaTokens): Promise<void> => {
        if (!tokens) {
            logger.error("Users.onStravaMissingPermission", "Missing tokens")
            return
        }

        // Masked token used on warning logs.
        const token = tokens.accessToken || tokens.previousAccessToken
        const maskedToken = `${token.substring(0, 2)}*${token.substring(token.length - 2)}`

        try {
            const user = await this.getByToken(tokens)

            if (!user) {
                logger.warn("Users.onStravaMissingPermission", `No user found for token ${maskedToken}`)
                return
            }

            // Write not suspended yet? Do it now and notify the user.
            if (!user.writeSuspended) {
                const title = "Missing Strava permissions"
                const body = "You haven't authorized Strautomator to make changes to your Strava account (missing write permissions). Please login again."
                const href = "https://strautomator.com/auth/login"
                const expiry = dayjs().add(30, "days").toDate()
                await notifications.createNotification(user, {title: title, body: body, href: href, auth: true, dateExpiry: expiry})

                const updatedUser: Partial<UserData> = {id: user.id, displayName: user.displayName, writeSuspended: true}
                await this.update(updatedUser)
            }
        } catch (ex) {
            logger.error("Notifications.onStravaMissingPermission", `Failed to notify user for token ${maskedToken}`)
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
        const maskedToken = `${refreshToken.substring(0, 2)}*${refreshToken.substring(refreshToken.length - 2)}`

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
        const maskedToken = `${token.substring(0, 2)}*${token.substring(token.length - 2)}`

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
            logger.warn("Strava.onStravaTokenFailure", logHelper.user(user), `Reauth count: ${user.reauth}`)

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
                logger.warn("Users.onStravaTokenFailure", logHelper.user(user), `User suspended due to too many token failures`)
                await this.suspend(user, "Too many Strava token failures")
            }

            await this.update(updatedUser)
        } catch (ex) {
            logger.error("Users.onStravaTokenFailure", `Failed to email user about invalid token ${maskedToken}`)
        }
    }

    /**
     * When a Spotify refresh token has expired or a token has failed, notify the user.
     * @param user The user.
     */
    private onSpotifyTokenFailure = async (user: UserData): Promise<void> => {
        const updatedUser: Partial<UserData> = {id: user.id, displayName: user.displayName}

        // When the token has failed for the first time, set the auth state to "token-failed".
        // If it fails again, notify the user.
        try {
            if (!user.spotifyAuthState) {
                user.spotifyAuthState = "token-failed"
            } else if (user.spotifyAuthState == "token-failed") {
                user.spotifyAuthState = "token-fail-notified"
                delete user.spotify

                // Failed at least twice, so notify the user that reauth is needed and reset the existing Spotify tokens.
                const nOptions: Partial<AuthNotification> = {
                    title: "Spotify reauthentication needed",
                    body: "Your Spotify account authentication has expired, please login again.",
                    href: "/account?spotify=link",
                    auth: true
                }
                await notifications.createNotification(user, nOptions)
            } else {
                return
            }

            // Reset the Spotify user data.
            updatedUser.spotifyAuthState = user.spotifyAuthState
            updatedUser.spotify = FieldValue.delete() as any
            await this.update(updatedUser)
        } catch (ex) {
            logger.error("Users.onSpotifyTokenFailure", ex)
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
     * Get idle users that have not received any activities from Strava, or had their account
     * suspended for a while. Used mostly for cleanup purposes.
     */
    getIdle = async (): Promise<UserData[]> => {
        try {
            const now = dayjs.utc()

            // Suspended users.
            const whereSuspendedFlag = ["suspended", "==", true]
            const whereSuspended = ["dateLastActivity", "<", now.subtract(settings.users.idleDays.suspended, "days").toDate()]
            const suspended = await database.search("users", [whereSuspendedFlag, whereSuspended])

            // Users with no activities sent by Strava for a while.
            const whereNoActivities = ["dateLastActivity", "<", now.subtract(settings.users.idleDays.noActivities, "days").toDate()]
            const noActivities = await database.search("users", [whereNoActivities])

            // Users that haven't logged in for a while.
            const whereNoLogin = settings.users.idleDays.noLogin ? ["dateLogin", "<", now.subtract(settings.users.idleDays.noLogin, "days").toDate()] : null
            const noLogin = whereNoLogin ? await database.search("users", [whereNoLogin]) : []

            logger.info("Users.getIdle", `${suspended.length || "no"} suspended, ${noActivities.length || "no"} with no activities, ${noLogin.length || "no"} with no recent logins`)

            return _.concat(suspended, noActivities, noLogin)
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
     * Get the user by username.
     * @param username The user's profile username.
     */
    getByUsername = async (username: string): Promise<UserData> => {
        try {
            const users = await database.search("users", ["profile.username", "==", username.toLowerCase()])
            const userData = users.length > 0 ? users[0] : null

            if (userData) {
                logger.info("Users.getByUsername", username, logHelper.user(userData))
            } else {
                logger.warn("Users.getByUsername", username, "Not found")
            }

            return userData
        } catch (ex) {
            logger.error("Users.getByUsername", username, ex)
            throw ex
        }
    }

    /**
     * Get the user for the passed access token.
     * @param tokens The user's Strava access and refresh token tokens.
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
                    const maskedToken = `${tokens.accessToken.substring(0, 2)}*${tokens.accessToken.substring(tokens.accessToken.length - 2)}`
                    logger.debug("Users.getByToken", `Found ${users[0].id} - ${users[0].displayName} by current token ${maskedToken}`)

                    return users[0]
                }

                // Try finding also on the previous access token.
                users = await database.search("users", ["stravaTokens.previousAccessToken", "==", encryptedToken])

                if (users.length > 0) {
                    const maskedToken = `${tokens.accessToken.substring(0, 2)}*${tokens.accessToken.substring(tokens.accessToken.length - 2)}`
                    logger.debug("Users.getByToken", `Found ${users[0].id} - ${users[0].displayName} by previous token ${maskedToken}`)

                    return users[0]
                }
            }

            // Refresh token was passed? Try getting user with that refresh token.
            if (tokens.refreshToken) {
                encryptedToken = encryptData(tokens.refreshToken)
                users = await database.search("users", ["stravaTokens.refreshToken", "==", encryptedToken])

                if (users.length > 0) {
                    const maskedToken = `${tokens.refreshToken.substring(0, 2)}*${tokens.refreshToken.substring(tokens.refreshToken.length - 2)}`
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

    /**
     * Get a user based on the Garmin ID.
     * @param profileId Garmin profile ID.
     */
    getByGarminId = async (garminProfileId: string): Promise<UserData> => {
        try {
            const users = await database.search("users", ["garmin.id", "==", garminProfileId])
            const user = users.length > 0 ? users[0] : null

            if (user) {
                logger.info("Users.getByGarminId", garminProfileId, logHelper.user(user))
            } else {
                logger.warn("Users.getByGarminId", garminProfileId, "Not found")
            }

            return user
        } catch (ex) {
            logger.error("Garmin.getByGarminId", garminProfileId, ex)
            throw ex
        }
    }

    /**
     * Get list of users with a linked Garmin account.
     */
    getWithGarmin = async (): Promise<UserData[]> => {
        try {
            const where = [["garmin.tokens.accessToken", "!=", ""]]
            const users = await database.search("users", where)

            logger.info("Users.getWithGarmin", `Got ${users.length || "no"} linked Garmin users`)
            return users
        } catch (ex) {
            logger.error("Users.getWithGarmin", ex)
            throw ex
        }
    }

    /**
     * Get list of users with a linked Spotify account.
     */
    getWithSpotify = async (): Promise<UserData[]> => {
        try {
            const where = [["spotify.tokens.accessToken", "!=", ""]]
            const users = await database.search("users", where)

            logger.info("Users.getWithSpotify", `Got ${users.length || "no"} linked Spotify users`)
            return users
        } catch (ex) {
            logger.error("Users.getWithSpotify", ex)
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
                dateLogin: now
            }

            // Fetch or create document on database.
            const doc = database.doc("users", profile.id)
            const docSnapshot = await doc.get()
            const exists = docSnapshot.exists

            // Set registration date, if user does not exist yet.
            if (!exists) {
                logger.debug("Users.upsert", profile.id, "Will create new user")

                // Beta available to PRO users only.
                if (settings.beta.enabled) {
                    const docFromProd = await database.doc("users", profile.id, settings.beta.prodCollectionSuffix).get()
                    if (!docFromProd.exists || !docFromProd.data().isPro) {
                        logger.warn("Users.upsert", profile.id, "Beta available to PRO users only")
                        userData.isPro = false
                        return userData
                    }
                }

                userData.displayName = profile.username || profile.firstName || profile.lastName
                userData.dateRegistered = now
                userData.preferences = {}
                userData.recipes = {}
                userData.recipeCount = 0
                userData.activityCount = 0
                userData.urlToken = crypto.randomBytes(12).toString("hex")
            }
            // If user exists, update recipe count and gear details.
            else {
                const docData = docSnapshot.data()
                const existingData = docData as UserData

                userData.dateLastActivity = existingData.dateLastActivity

                // Remove the reauth flags.
                if (_.isNumber(existingData.reauth)) {
                    userData.reauth = FieldValue.delete() as any
                }

                // Update recipe count.
                if (existingData.recipes) {
                    userData.recipeCount = Object.keys(existingData.recipes).length
                }

                // User has changed the access token? Update the previous one.
                if (existingData.stravaTokens?.accessToken != stravaTokens.accessToken) {
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
                    if (!_.isNil(existingData.suspended)) {
                        if (existingData.suspended === true) {
                            logger.warn("Users.upsert", logHelper.user(userData), "Reactivated, suspended = false")
                        }
                        userData.suspended = FieldValue.delete() as any
                    }
                    if (!_.isNil(existingData.writeSuspended)) {
                        userData.writeSuspended = FieldValue.delete() as any
                    }
                }
            }

            // Users are always PRO on the beta environment.
            if (settings.beta.enabled) {
                userData.isPro = true
            }

            // Save user to the database.
            await database.merge("users", userData, doc)

            // If a new user, publish the user creation event.
            if (!exists) {
                logger.info("Users.upsert", logHelper.user(userData), "New registration")

                eventManager.emit("Users.create", userData)
            } else {
                logger.info("Users.upsert", logHelper.user(userData), "Updated")
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
     * @param replace Set to true to fully replace data instead of merging, default is false.
     */
    update = async (user: Partial<UserData>, replace?: boolean): Promise<void> => {
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
                    logs.push(`Last activity: ${dayjs(user.dateLastActivity).utc().format("lll")}`)
                }
                if (user.ftpStatus) {
                    logs.push(`Previous FTP: ${user.ftpStatus.previousFtp || 0}`)
                }
                if (user.fitnessLevel) {
                    logs.push(`Fitness level: ${user.fitnessLevel}`)
                }
                if (user.calendarTemplate) {
                    logs.push("Calendar template")
                }
                if (user.stravaTokens) {
                    logs.push("Strava tokens")
                }
                if (user.profile) {
                    if (user.profile.bikes?.length > 0) {
                        logs.push("Bikes")
                    }
                    if (user.profile.shoes?.length > 0) {
                        logs.push("Shoes")
                    }
                }
                if (user.preferences) {
                    logs.push(_.toPairs(user.preferences).join(" | ").replace(/\,/gi, "="))
                }
                if (user.spotify) {
                    logs.push("Spotify")
                }
                if (user.subscriptionId) {
                    logs.push(`Subscription: ${user.subscriptionId}`)
                }
            } else {
                await database.set("users", user, user.id)
                logs.push("Replaced entire user data")
            }

            logger.info("Users.update", logHelper.user(user), logs.length > 0 ? logs.join(" | ") : "Updated")
        } catch (ex) {
            logger.error("Users.update", logHelper.user(user), ex)
            throw ex
        }
    }

    /**
     * Delete the specified user, its activities and automation stats from the database.
     * @param user User to be deleted.
     */
    delete = async (user: UserData): Promise<void> => {
        try {
            if (!user || !user.id) {
                throw new Error("Missing required user details")
            }

            // Delete user from database first.
            await database.delete("users", user.id)
            logger.warn("Users.delete", logHelper.user(user), `${user.isPro ? "PRO" : "Free"} account deleted`)

            // Publish delete event so related contents can be removed as well.
            eventManager.emit("Users.delete", user)
        } catch (ex) {
            logger.error("Users.delete", logHelper.user(user), ex)
            throw ex
        }
    }

    /**
     * Suspend / deactivate the specified user.
     * @param user The user to be deactivate.
     * @param reason Reason for suspension.
     */
    suspend = async (user: UserData, reason: string): Promise<void> => {
        try {
            if (user.isPro) {
                logger.warn("Users.suspend", logHelper.user(user), reason, "Abort, PRO users cannot be suspended")
                return
            }

            await database.merge("users", {id: user.id, suspended: true})
            logger.info("Users.suspend", logHelper.user(user), reason)

            // Alert the user via email.
            if (user.email) {
                const data = {
                    userId: user.id,
                    userName: user.profile.firstName || user.displayName,
                    reason: reason
                }
                const options = {
                    to: user.email,
                    template: "UserSuspended",
                    data: data
                }

                // Send suspension email in async mode (no need to wait for the result).
                mailer.send(options)
            }
        } catch (ex) {
            logger.error("Users.suspend", logHelper.user(user), reason, ex)
        }
    }

    /**
     * Add ID to the list of ignored user IDs.
     */
    ignore = async (id: string): Promise<void> => {
        try {
            if (this.ignoredUserIds.includes(id)) {
                logger.warn("Users.ignore", id, "Already ignored")
                return
            }

            logger.warn("Users.ignore", id, "Added to the list of ignored user IDs")
            this.ignoredUserIds.push(id)
            await database.appState.set("users", {ignored: this.ignoredUserIds})
        } catch (ex) {
            logger.error("Users.ignore", id, ex)
        }
    }

    /**
     * Replace user name with a random value.
     * @param user The user to be anonymized.
     */
    anonymize = (user: UserData | Partial<UserData>): void => {
        if (!user.profile) user.profile = {} as any
        const firstNames = ["Chair", "Table", "Ball", "Wheel", "Flower", "Sun", "Globe", "January", "Dry", "Chain", "High", "Low", "Ghost"]
        const lastNames = ["Winter", "McGyver", "Second", "Tequila", "Whiskey", "Wine", "House", "Light", "Fast", "Rock", "Pop", "Jazz", "Rider"]

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
                displayName: user.displayName,
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
            logger.info("Users.setActivityCount", user.id, user.displayName, `Activity count: ${user.activityCount + 1}`)
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
    }

    /**
     * Create a new URL token for the user.
     * @param user The user.
     */
    setUrlToken = async (user: UserData): Promise<string> => {
        try {
            const oldToken = user.urlToken
            const newToken = crypto.randomBytes(12).toString("hex")
            const data: Partial<UserData> = {
                id: user.id,
                displayName: user.displayName,
                urlToken: newToken
            }

            await database.merge("users", data)
            logger.info("Users.setUrlToken", user.id, user.displayName, "New token generated", `Old token: ${oldToken}`)

            return newToken
        } catch (ex) {
            logger.error("Users.setUrlToken", user.id, user.displayName, ex)
        }
    }

    // SWITCHING SUBSCRIPTIONS
    // --------------------------------------------------------------------------

    /**
     * Switch the specified user to the PRO plan.
     * @param user Data for the user that should be updated.
     * @param subscription Optional subscription that was created, otherwise default to a "friend" subscription.
     */
    switchToPro = async (user: UserData, subscription?: BaseSubscription | PayPalSubscription | GitHubSubscription): Promise<void> => {
        try {
            user.isPro = true
            await this.update({id: user.id, displayName: user.displayName, subscriptionId: subscription.id, isPro: true})

            // Reset the batch date, if there's one, so the user can run a new batch sync straight away.
            if (user.dateLastBatchProcessing) {
                logger.info("Users.switchToPro", user.id, user.displayName, "Resetting the last batch processing date")
                user.dateLastBatchProcessing = user.dateRegistered
            }

            // Friend or PayPal subscription? GitHub needs no additional processing.
            if (subscription.source == "paypal") {
                const paypalSub = subscription as PayPalSubscription

                // Email passed with the subscription and was not set for that user? Set it now.
                if (!user.email && paypalSub.email) {
                    user.email = paypalSub.email
                }
            }

            // User was on the free plan before? Send a thanks email.
            if (user.email) {
                const data = {
                    userId: user.id,
                    userName: user.profile.firstName || user.displayName,
                    subscriptionId: subscription.id,
                    subscriptionSource: subscription.source
                }
                const options = {
                    to: user.email,
                    template: "UpgradedToPro",
                    data: data
                }

                // Send upgraded email in async mode (no need to wait).
                mailer.send(options)
            }

            logger.info("Users.switchToPro", user.id, user.displayName, `Subscription: ${subscription.source} ${subscription.id}`)
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
    switchToFree = async (user: UserData, subscription?: BaseSubscription | PayPalSubscription | GitHubSubscription): Promise<void> => {
        try {
            user.isPro = false
            await this.update({id: user.id, displayName: user.displayName, subscriptionId: FieldValue.delete() as any, isPro: false})

            // Expire the subscription, in case it's active.
            if (subscription?.status == "ACTIVE") {
                await subscriptions.expire(subscription)
            }

            const status = subscription ? subscription.status.toLowerCase() : "cancelled"

            // User had a valid PRO subscription before? Send an email about the downgrade.
            if (user.email) {
                const data = {
                    userId: user.id,
                    userName: user.profile.firstName || user.displayName,
                    subscriptionId: subscription.id,
                    subscriptionSource: subscription.source,
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

            logger.info("Users.switchToFree", user.id, user.displayName, `Subscription: ${subscription.source} ${subscription.id} - ${status}`)
        } catch (ex) {
            logger.error("Users.switchToFree", user.id, user.displayName, ex)
            throw ex
        }
    }
}

// Exports...
export default Users.Instance
