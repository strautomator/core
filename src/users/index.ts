// Strautomator Core: Users

import {disableProPreferences, validateEmail, validateUserPreferences} from "./utils"
import {UserCalendarTemplate, UserData} from "../users/types"
import {BaseSubscription} from "../subscriptions/types"
import {AuthNotification} from "../notifications/types"
import {PaddleSubscription} from "../paddle/types"
import {PayPalSubscription} from "../paypal/types"
import {GitHubSubscription} from "../github/types"
import {StravaProfile, StravaTokens} from "../strava/types"
import {EmailSendingOptions} from "../mailer/types"
import {encryptData} from "../database/crypto"
import {FieldValue} from "@google-cloud/firestore"
import database from "../database"
import eventManager from "../eventmanager"
import mailer from "../mailer"
import maps from "../maps"
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

        eventManager.on("Paddle.subscriptionCreated", this.onSubscription)
        eventManager.on("Paddle.subscriptionUpdated", this.onSubscription)
        eventManager.on("PayPal.subscriptionCreated", this.onSubscription)
        eventManager.on("PayPal.subscriptionUpdated", this.onSubscription)
        eventManager.on("GitHub.subscriptionUpdated", this.onSubscription)
        eventManager.on("Strava.missingPermission", this.onStravaMissingPermission)
        eventManager.on("Strava.refreshToken", this.onStravaRefreshToken)
        eventManager.on("Strava.tokenFailure", this.onStravaTokenFailure)
        eventManager.on("Spotify.tokenFailure", this.onSpotifyTokenFailure)
        eventManager.on("Garmin.activityFailure", this.onGarminActivityFailure)
    }

    /**
     * Set user isPro status depending on the subscription status.
     * @param subscription The PayPal subscription details.
     */
    private onSubscription = async (subscription: GitHubSubscription | PaddleSubscription | PayPalSubscription): Promise<void> => {
        if (!subscription) {
            logger.error("Users.onSubscription", "Missing subscription data")
            return
        }

        logger.info("Users.onSubscription", `User ${subscription.userId}`, subscription.id, subscription.status)

        try {
            const user = await this.getById(subscription.userId)

            // User not found? Stop here.
            if (!user) {
                logger.warn("Users.onSubscription", `User ${subscription.userId} not found`, `Reference subscription: ${subscription.id}`)
                return
            }

            // Switch to PRO if subscription is active, or back to free if it has expired.
            if (!user.isPro && subscription.status == "ACTIVE") {
                await this.switchToPro(user, subscription)
            } else if (user.isPro && ["CANCELLED", "EXPIRED", "SUSPENDED"].includes(subscription.status)) {
                await this.switchToFree(user, subscription)
            } else if (subscription.source == "paddle" && user.paddleTransactionId) {
                await this.update({id: user.id, displayName: user.displayName, paddleTransactionId: FieldValue.delete() as any})
            }

            // Make sure we don't have dangling subscription IDs if user is not PRO for more than 24h.
            if (!user.isPro && user.subscriptionId && subscription.status == "CANCELLED" && dayjs(subscription.dateLastPayment || subscription.dateUpdated).diff(new Date(), "days") > 1) {
                await this.update({id: user.id, displayName: user.displayName, subscriptionId: FieldValue.delete() as any})
            }
        } catch (ex) {
            logger.error("Users.onSubscription", `Failed to update user ${subscription.userId} subscription ${subscription.id} details`, ex)
        }
    }

    /**
     * When user hasn't authorized Strautomator to read or write to the Strava account.
     * @param tokens Set of Strava tokens that failed due to missing permissions.
     * @param permission The missing permission (read or write).
     * @param url Optional, URL which failed.
     */
    private onStravaMissingPermission = async (tokens: StravaTokens, permission: "read" | "write", url?: string): Promise<void> => {
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

            const title = "Missing Strava permissions"
            const href = "https://strautomator.com/auth/login"
            const expiry = dayjs().add(30, "days").toDate()
            let body: string = ""

            logger.warn("Users.onStravaMissingPermission", logHelper.user(user), permission, url || "No URL provided")

            // Notify user about missing read or write permissions.
            if (permission == "read" && [settings.oauth.tokenFailuresDisable, settings.oauth.tokenFailuresAlert].includes(user.authFailures)) {
                body = "You haven't authorized Strautomator to read your full Strava details (missing read permissions). Please login again."
            } else if (permission == "write" && !user.writeSuspended) {
                body = "You haven't authorized Strautomator to make changes to your Strava account (missing write permissions). Please login again."
                const updatedUser: Partial<UserData> = {id: user.id, displayName: user.displayName, writeSuspended: true}
                await this.update(updatedUser)
            }

            if (body) {
                await notifications.createNotification(user, {title: title, body: body, href: href, auth: true, dateExpiry: expiry})
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
                stravaTokens: tokens
            }

            await this.update(updatedUser as UserData)
        } catch (ex) {
            logger.error("Users.onStravaRefreshToken", `Failed to update user tokens for original refresh token ${maskedToken}`)
        }
    }

    /**
     * When a refresh token has expired, check if user has an email address and contact asking to login again.
     * @param token The expired or invalid Strava auth token.
     * @param url Optional, URL which failed.
     */
    private onStravaTokenFailure = async (tokens: StravaTokens, url?: string): Promise<void> => {
        const urlLog = url ? url : "No URL provided"

        if (!tokens) {
            logger.error("Users.onStravaTokenFailure", "Missing token data", urlLog)
            return
        }

        // Masked token used on warning logs.
        const token = tokens.accessToken || tokens.refreshToken
        const maskedToken = `${token.substring(0, 2)}*${token.substring(token.length - 2)}`
        const now = dayjs().utc()

        try {
            const user = await this.getByToken(tokens)
            if (!user) {
                logger.warn("Users.onStravaTokenFailure", `No user found for token ${maskedToken}`, urlLog)
                return
            }

            // Set the auth failed date (if not set yet) and increment the auth failures counter.
            // The auth failure counter is reset after 14 days by default, so sporadic failures should not cause problems.
            if (!user.dateAuthFailed) {
                user.dateAuthFailed = now.toDate()
            } else if (user.dateAuthFailed < now.subtract(settings.oauth.reauthResetDays, "days").toDate()) {
                logger.warn("Users.onStravaTokenFailure", logHelper.user(user), "Auth failures reset")
                user.dateAuthFailed = now.toDate()
                user.authFailures = 0
            }
            if (!user.authFailures) {
                user.authFailures = 0
            }
            user.authFailures++

            const updatedUser: Partial<UserData> = {id: user.id, displayName: user.displayName, authFailures: user.authFailures, dateAuthFailed: user.dateAuthFailed}
            logger.warn("Strava.onStravaTokenFailure", logHelper.user(user), `Auth failures: ${user.authFailures}`)

            // User has an email address? Contact asking to connect to Strautomator again,
            // and if it fails too many times, disable the user.
            if (user.email && [settings.oauth.tokenFailuresAlert, settings.oauth.tokenFailuresDisable].includes(user.authFailures)) {
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
            }

            await this.update(updatedUser)

            // Reached the failures limit? Suspend the user.
            if (user.authFailures >= settings.oauth.tokenFailuresDisable) {
                logger.warn("Users.onStravaTokenFailure", logHelper.user(user), "User suspended due to too many token failures")
                await this.suspend(user, "Too many Strava token failures")
            }
        } catch (ex) {
            logger.error("Users.onStravaTokenFailure", `Failed to process Strava token failure: ${maskedToken}`, urlLog)
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

    /**
     * When a Garmin API request fails, check if we should disable further requests and notify the user.
     * @param user The user.
     */
    private onGarminActivityFailure = async (user: UserData): Promise<void> => {
        const updatedUser: Partial<UserData> = {id: user.id, displayName: user.displayName, garminFailures: user.garminFailures ? user.garminFailures + 1 : 1}

        // Too many repeated failures? Notify the user to reauthorize Garmin.
        try {
            if (user.garminFailures == settings.oauth.tokenFailuresDisable) {
                const nOptions: Partial<AuthNotification> = {
                    title: "Garmin reauthentication needed",
                    body: "The service failed to connect to your Garmin data too many times, please login again.",
                    href: "/account?garmin=link",
                    auth: true
                }
                await notifications.createNotification(user, nOptions)
            }

            await this.update(updatedUser)
        } catch (ex) {
            logger.error("Users.onGarminActivityFailure", ex)
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
     * Get PRO users.
     */
    getPro = async (): Promise<UserData[]> => {
        try {
            const result = await database.search("users", ["isPro", "==", true])

            logger.info("Users.getPro", `${result.length} PRO users`)
            return result
        } catch (ex) {
            logger.error("Users.getPro", ex)
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
     * @param noLoginDays Optional, force the number of days without login.
     */
    getIdle = async (noLoginDays?: number): Promise<UserData[]> => {
        try {
            const now = dayjs.utc()

            // Suspended users.
            const whereSuspendedFlag = ["suspended", "==", true]
            const whereSuspended = ["dateLastActivity", "<", now.subtract(settings.users.idleDays.default, "days").toDate()]
            const suspended = await database.search("users", [whereSuspendedFlag, whereSuspended])

            // Users with no activities sent by Strava for a while.
            const whereNoActivities = ["dateLastActivity", "<", now.subtract(settings.users.idleDays.noActivities, "days").toDate()]
            const noActivities = await database.search("users", [whereNoActivities])

            // Users that haven't logged in for a while.
            const whereNoLogin = settings.users.idleDays.noLogin ? ["dateLogin", "<", now.subtract(noLoginDays || settings.users.idleDays.noLogin, "days").toDate()] : null
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
            const user: UserData = await database.get("users", id)
            if (user && !user.countryCode && user.profile?.country) {
                user.countryCode = maps.getCountryCode(user.profile.country)
            }
            return user
        } catch (ex) {
            logger.error("Users.getById", id, ex)
            throw ex
        }
    }

    /**
     * Get the user by the Paddle customer ID.
     * @param id Paddle customer ID.
     */
    getByPaddleId = async (paddleId: string): Promise<UserData> => {
        try {
            const users = await database.search("users", ["paddleId", "==", paddleId])
            const userData = users.length > 0 ? users[0] : null

            if (userData) {
                logger.info("Users.getByPaddleId", paddleId, logHelper.user(userData))
            } else {
                logger.warn("Users.getByPaddleId", paddleId, "Not found")
            }

            return userData
        } catch (ex) {
            logger.error("Users.getByPaddleId", paddleId, ex)
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
            logger.error("Users.getByGarminId", garminProfileId, ex)
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

    /**
     * Get a user based on the Wahoo ID.
     * @param profileId Wahoo profile ID.
     */
    getByWahooId = async (wahooProfileId: number): Promise<UserData> => {
        try {
            const users = await database.search("users", ["wahoo.id", "==", wahooProfileId])
            const user = users.length > 0 ? users[0] : null

            if (user) {
                logger.info("Users.getByWahooId", wahooProfileId, logHelper.user(user))
            } else {
                logger.warn("Users.getByWahooId", wahooProfileId, "Not found")
            }

            return user
        } catch (ex) {
            logger.error("Users.getByWahooId", wahooProfileId, ex)
            throw ex
        }
    }

    /**
     * Get list of users with a linked Wahoo account.
     */
    getWithWahoo = async (): Promise<UserData[]> => {
        try {
            const where = [["wahoo.tokens.accessToken", "!=", ""]]
            const users = await database.search("users", where)

            logger.info("Users.getWithWahoo", `Got ${users.length || "no"} linked Wahoo users`)
            return users
        } catch (ex) {
            logger.error("Users.getWithWahoo", ex)
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

            // Set base data, if user does not exist yet.
            if (!exists) {
                logger.debug("Users.upsert", profile.id, "Will create new user")

                userData.displayName = profile.username || profile.firstName || profile.lastName
                userData.dateRegistered = now
                userData.preferences = {}
                userData.recipes = {}
                userData.recipeCount = 0
                userData.activityCount = 0
                userData.urlToken = crypto.randomBytes(12).toString("hex")
            }
            // If user exists, update the relevant data.
            else {
                const docData = docSnapshot.data()
                const existingData = docData as UserData

                userData.dateLastActivity = existingData.dateLastActivity
                userData.preferences = existingData.preferences || {}

                // Remove the auth flags.
                if (existingData.dateAuthFailed) {
                    userData.dateAuthFailed = FieldValue.delete() as any
                    userData.authFailures = FieldValue.delete() as any
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

                // Preferences are mandatory now.
                if (!existingData.preferences) {
                    existingData.preferences = {}
                }

                // User has opted for the privacy mode?
                if (userData.preferences.privacyMode) {
                    userData.profile.username = FieldValue.delete() as any
                    userData.profile.firstName = FieldValue.delete() as any
                    userData.profile.lastName = FieldValue.delete() as any
                    userData.profile.city = FieldValue.delete() as any
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

                if (existingData.debug) {
                    const diff = _.reduce(existingData, (result, value, key) => (_.isEqual(value, userData[key]) ? result : result.concat(key)), [])
                    logger.info("Users.upsert.debug", logHelper.user(userData), JSON.stringify(diff, null, 0))
                }
            }

            // Update the user's country code.
            if (profile.country) {
                userData.countryCode = maps.getCountryCode(profile.country)
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
            const logValue = (value: any) => (value == FieldValue.delete() ? "deleted" : value)

            if (!replace) {
                if (user.profile) {
                    user.displayName = user.profile.username || user.profile.firstName || user.profile.lastName
                }

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
                if (user.stravaTokens) {
                    logs.push("Strava tokens")
                }
                if (user.profile) {
                    if (user.profile.bikes?.length > 0) {
                        logs.push(`Bikes: ${user.profile.bikes.length}`)
                    }
                    if (user.profile.shoes?.length > 0) {
                        logs.push(`Shoes: ${user.profile.shoes.length}`)
                    }
                }
                if (user.garmin) {
                    logs.push(`Garmin: ${logValue(user.garmin.id || user.garmin)}`)
                }
                if (user.wahoo) {
                    logs.push(`Wahoo: ${logValue(user.wahoo.id || user.wahoo)}`)
                }
                if (user.spotify) {
                    logs.push(`Spotify: ${logValue("auth")}`)
                }
                if (user.paddleId) {
                    logs.push(`Paddle ID: ${logValue(user.paddleId)}`)
                }
                if (user.subscriptionId) {
                    logs.push(`Subscription: ${logValue(user.subscriptionId)}`)
                }
                if (user.preferences) {
                    const prefs = Object.keys(user.preferences).map((k) => `${k}=${logValue(user.preferences[k])}`)
                    if (prefs.length > 0) {
                        logs.push(prefs.join(" | "))
                    } else if (!replace) {
                        delete user.preferences
                    }
                }

                // Update user on the database.
                await database.merge("users", user)
            } else {
                await database.set("users", user, user.id)
                logs.push("Replaced entire user data")
            }

            logger.info("Users.update", logHelper.user(user), logs.length > 0 ? logs.join(" | ") : "Updated")
            if (user.debug) {
                logger.info("Users.update.debug", logHelper.user(user), JSON.stringify(user, null, 0))
            }
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
                logger.warn("Users.suspend", logHelper.user(user), reason, "Suspending a PRO user")
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
     * @param email Email address entered by the user that needs to be confirmed.
     */
    setConfirmEmail = async (user: UserData, email: string): Promise<void> => {
        try {
            email = await validateEmail(user, email)

            // Make sure email has changed before proceeding. If not, stop here.
            if (user.confirmEmail && user.confirmEmail == email) {
                logger.warn("Users.setConfirmEmail", user.id, `Email ${email} already waiting to be confirmed`)
            }

            // Confirmation token.
            const token = crypto.randomBytes(12).toString("hex").toUpperCase()

            // Set email to be confirmed.
            const data: Partial<UserData> = {
                id: user.id,
                displayName: user.displayName,
                confirmEmail: `${token}:${email}`
            }
            await database.merge("users", data)

            // Send confirmation email.
            const options: EmailSendingOptions = {
                to: email,
                template: "ConfirmEmail",
                data: {
                    userId: user.id,
                    userName: user.displayName,
                    email: email,
                    token: token
                }
            }
            await mailer.send(options)

            logger.info("Users.setConfirmEmail", logHelper.user(user), email, token)
        } catch (ex) {
            logger.error("Users.setConfirmEmail", logHelper.user(user), email, ex)
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
            email = await validateEmail(user, email)

            // Make sure email has changed before proceeding. If not, stop here.
            if (user.email && user.email == email) {
                logger.warn("Users.setEmail", user.id, `Email ${email} hasn't changed`)
                return
            }

            // Save new email address.
            const data: Partial<UserData> = {
                id: user.id,
                displayName: user.displayName,
                email: email,
                confirmEmail: FieldValue.delete() as any
            }
            await database.merge("users", data)

            logger.info("Users.setEmail", logHelper.user(user), email)
        } catch (ex) {
            logger.error("Users.setEmail", logHelper.user(user), email, ex)
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
            logger.info("Users.setActivityCount", logHelper.user(user), `Activity count: ${user.activityCount + 1}`)
        } catch (ex) {
            logger.error("Users.setActivityCount", logHelper.user(user), ex)
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
            logger.info("Users.setRecipesOrder", logHelper.user(user), logOrder.join(", "))
        } catch (ex) {
            logger.error("Users.setRecipesOrder", logHelper.user(user), ex)
            throw ex
        }
    }

    /**
     * Update the calendar activities template for the user.
     * @param user The user.
     * @param template The new calendar template.
     */
    setCalendarTemplate = async (user: UserData, template: UserCalendarTemplate): Promise<void> => {
        try {
            if (!template || (!template.eventSummary && !template.eventDetails)) {
                template = FieldValue.delete() as any
            } else if (!template.eventSummary) {
                template.eventSummary = FieldValue.delete() as any
            } else if (!template.eventDetails) {
                template.eventDetails = FieldValue.delete() as any
            }

            // Set user calendar template and save to the database.
            const data: Partial<UserData> = {
                id: user.id,
                displayName: user.displayName,
                preferences: {calendarTemplate: template}
            }

            await this.update(data)
            logger.info("Users.setCalendarTemplate", logHelper.user(user), template ? "Template updated" : "Template removed")
            eventManager.emit("Users.setCalendarTemplate", user)
        } catch (ex) {
            logger.error("Users.setCalendarTemplate", logHelper.user(user), ex)
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
            logger.info("Users.setUrlToken", logHelper.user(user), "New token generated", `Old token: ${oldToken}`)
            eventManager.emit("Users.setUrlToken", user)

            return newToken
        } catch (ex) {
            logger.error("Users.setUrlToken", logHelper.user(user), ex)
            throw ex
        }
    }

    // SWITCHING SUBSCRIPTIONS
    // --------------------------------------------------------------------------

    /**
     * Switch the specified user to the PRO plan.
     * @param user Data for the user that should be updated.
     * @param subscription Optional subscription that was created, otherwise default to a "friend" subscription.
     */
    switchToPro = async (user: UserData, subscription?: BaseSubscription | PaddleSubscription | PayPalSubscription | GitHubSubscription): Promise<void> => {
        try {
            const proUser: Partial<UserData> = {
                id: user.id,
                displayName: user.displayName,
                subscriptionId: subscription.id,
                isPro: true,
                preferences: {
                    linksOn: settings.plans.pro.linksOn
                }
            }
            if (user.paddleTransactionId) {
                proUser.paddleTransactionId = FieldValue.delete() as any
            }

            // Additional subscription processing for email and transaction ID.
            if (subscription.source == "paddle" || subscription.source == "paypal") {
                const sub = subscription as PaddleSubscription | PayPalSubscription

                // Email passed with the subscription and was not set for that user? Set it now.
                if (!user.email && sub.email) {
                    logger.info("Users.switchToPro", logHelper.user(user), `User has no email, using ${sub.email} from the subscription`)
                    proUser.email = sub.email
                }

                // Remove the Paddle transaction ID, as it's not needed from now on.
                if (user.paddleTransactionId) {
                    proUser.paddleTransactionId = FieldValue.delete() as any
                }
            }

            // Reset the batch date, if there's one, so the user can run a new batch sync straight away.
            if (user.dateLastBatchProcessing) {
                logger.info("Users.switchToPro", logHelper.user(user), "Resetting the last batch processing date")
                proUser.dateLastBatchProcessing = user.dateRegistered
            }

            _.assign(user, proUser)
            await this.update(proUser)

            logger.info("Users.switchToPro", logHelper.user(user), `Subscription: ${subscription.source} ${subscription.id}`)
            eventManager.emit("Users.switchToPro", user, subscription)
        } catch (ex) {
            logger.error("Users.switchToPro", logHelper.user(user), ex)
            throw ex
        }
    }

    /**
     * Switch the specified to the free plan.
     * @param user Data for the user that should be updated.
     * @param subscription Optional subscription that was deactivated.
     */
    switchToFree = async (user: UserData, subscription?: BaseSubscription | PaddleSubscription | PayPalSubscription | GitHubSubscription): Promise<void> => {
        try {
            const freeUser: Partial<UserData> = {
                id: user.id,
                displayName: user.displayName,
                subscriptionId: FieldValue.delete() as any,
                isPro: false
            }
            if (user.paddleTransactionId) {
                freeUser.paddleTransactionId = FieldValue.delete() as any
            }

            // Remove PRO only preferences.
            if (user.preferences) {
                const resetFields = disableProPreferences(user)
                if (resetFields.length > 0) {
                    freeUser.preferences = _.pick(user.preferences, resetFields)
                }
            }

            // Disable recipes that are out of scope for the free plan.
            const recipes = Object.values(user.recipes || {})
            if (recipes.length > settings.plans.free.maxRecipes) {
                logger.info("Users.switchToFree", logHelper.user(user), `Will disable ${recipes.length - settings.plans.free.maxRecipes} recipes`)

                for (let i = settings.plans.free.maxRecipes; i < recipes.length; i++) {
                    recipes[i].disabled = true
                }
                freeUser.recipes = user.recipes
            }

            // Force expire the subscription if it's still active.
            if (subscription?.status == "ACTIVE") {
                await subscriptions.expire(subscription)
            }

            // Update user and expire the subscription, in case it's active.
            _.assign(user, freeUser)
            await this.update(freeUser)
            delete user.subscriptionId
            delete user.isPro

            const status = subscription?.status.toLowerCase() || "cancelled"
            logger.info("Users.switchToFree", logHelper.user(user), `Subscription: ${subscription.source} ${subscription.id} - ${status}`)
            eventManager.emit("Users.switchToFree", user, subscription)
        } catch (ex) {
            logger.error("Users.switchToFree", logHelper.user(user), ex)
            throw ex
        }
    }
}

// Exports...
export default Users.Instance
