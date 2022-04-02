// Strautomator Core: Notifications

import {BaseNotification, AuthNotification, FailedRecipeNotification, GearWearNotification} from "./types"
import {UserData} from "../users/types"
import database from "../database"
import eventManager from "../eventmanager"
import mailer from "../mailer"
import users from "../users"
import _ = require("lodash")
import cache = require("bitecache")
import logger = require("anyhow")
import dayjs from "../dayjs"
const settings = require("setmeup").settings

/**
 * Notifications manager.
 */
export class Notifications {
    private constructor() {}
    private static _instance: Notifications
    static get Instance() {
        return this._instance || (this._instance = new this())
    }

    // INIT
    // --------------------------------------------------------------------------

    /**
     * Init the Notifications manager.
     */
    init = async (): Promise<void> => {
        try {
            const duration = dayjs.duration(settings.notifications.cacheDuration, "seconds").humanize()
            cache.setup("notifications", settings.notifications.cacheDuration)
            logger.info("Notifications.init", `Cache notifications for up to ${duration}`)

            eventManager.on("Strava.missingPermission", this.onStravaMissingPermission)
            eventManager.on("Users.delete", this.onUserDelete)
        } catch (ex) {
            logger.error("Notifications.init", ex)
            throw ex
        }
    }

    /**
     * When user hasn't authorized Strautomator to write to its Strava account.
     * @param token The expired or invalid Strava auth token.
     */
    private onStravaMissingPermission = async (token: string): Promise<void> => {
        if (!token) {
            logger.error("Notifications.onStravaMissingPermission", "Missing token")
            return
        }

        // Masked token used on warning logs.
        const maskedToken = `${token.substring(0, 2)}***${token.substring(token.length - 2)}`

        try {
            const user = await users.getByToken({accessToken: token})

            if (!user) {
                logger.warn("Notifications.onStravaMissingPermission", `No user found for token ${maskedToken}`)
                return
            } else if (user.reauth == 0 || user.reauth == settings.oauth.tokenFailuresAlert * 2) {
                const title = "Missing Strava permissions"
                const body = "You haven't authorized Strautomator to read or make changes to your Strava account yet. Please authenticate again."
                const href = "https://strautomator.com/auth/login"
                const expiry = dayjs().add(5, "days").toDate()

                await this.createNotification(user, {title: title, body: body, href: href, auth: true, dateExpiry: expiry})
            }
        } catch (ex) {
            logger.error("Notifications.onStravaMissingPermission", `Failed to notify user for token ${maskedToken}`)
        }
    }

    /**
     * Delete user notifications after it gets deleted from the database.
     * @param user User that was deleted from the database.
     */
    private onUserDelete = async (user: UserData): Promise<void> => {
        try {
            const counter = await database.delete("notifications", ["userId", "==", user.id])

            if (counter > 0) {
                logger.info("Notifications.onUsersDelete", `User ${user.id} ${user.displayName}`, `Deleted ${counter} notifications`)
            }
        } catch (ex) {
            logger.error("Notifications.onUsersDelete", `User ${user.id} ${user.displayName}`, ex)
        }
    }

    // USER MESSAGES
    // --------------------------------------------------------------------------

    /**
     * Get a notification by its ID.
     * @param id The notification ID.
     */
    getById = async (id: string): Promise<BaseNotification> => {
        try {
            return await database.get("notifications", id)
        } catch (ex) {
            logger.error("Notifications.getById", id, ex)
            throw ex
        }
    }

    /**
     * Get list of notifications for the specified user.
     * @param user The user to get notifications for.
     * @param all If true, will get also read and expired notifications, default is false.
     */
    getForUser = async (user: UserData, all?: boolean): Promise<BaseNotification[]> => {
        const whichLog = all ? "All" : "Unread only"

        try {
            const now = new Date()
            const queries: any[] = [["userId", "==", user.id]]
            const cacheId = all ? "all" : "unread"

            // Not all? Filter unread and non-expired notifications.
            if (!all) {
                queries.push(["read", "==", false])
                queries.push(["dateExpiry", ">", now])
            }

            // Notifications stored on cache?
            const cached = cache.get("notifications", `${user.id}-${cacheId}`)
            if (cached) return cached

            // Fetch notifications from the database.
            const result = await database.search("notifications", queries)
            cache.set("notifications", `${user.id}-${all}`, result)

            if (result.length > 0) {
                logger.info("Notifications.getForUser", `User ${user.id} ${user.displayName}`, whichLog, `Got ${result.length} notification(s)`)
            } else {
                logger.debug("Notifications.getForUser", `User ${user.id} ${user.displayName}`, whichLog, `Got no notification(s)`)
            }

            return result
        } catch (ex) {
            logger.error("Notifications.getForUser", `User ${user.id} ${user.displayName}`, whichLog, ex)
            throw ex
        }
    }

    /**
     * Get list of notifications referencing the specified user gear.
     * @param user The user to get notifications for.
     * @param gearId The gear ID.
     * @param all If true, will get also read and expired notifications, default is false.
     */
    getForGear = async (user: UserData, gearId: string, all?: boolean): Promise<BaseNotification[]> => {
        const whichLog = all ? "All" : "Unread only"

        try {
            const now = new Date()
            const queries: any[] = [
                ["userId", "==", user.id],
                ["gearId", "==", gearId]
            ]

            // Not all? Filter unread and non-expired notifications.
            if (!all) {
                queries.push(["read", "==", false])
                queries.push(["dateExpiry", ">", now])
            }

            // Fetch notifications from the database.
            const result = await database.search("notifications", queries)

            if (result.length > 0) {
                logger.info("Notifications.getForGear", `User ${user.id} ${user.displayName}`, `Gear ${gearId}`, whichLog, `Got ${result.length} notification(s)`)
            } else {
                logger.debug("Notifications.getForGear", `User ${user.id} ${user.displayName}`, `Gear ${gearId}`, whichLog, `Got no notification(s)`)
            }

            return result
        } catch (ex) {
            logger.error("Notifications.getForGear", `User ${user.id} ${user.displayName}`, `Gear ${gearId}`, whichLog, ex)
            throw ex
        }
    }

    /**
     * Create a notification to the speicified user. It will NOT create a new notification
     * if the contents are the same as the last notification created for the user.
     * @param user The user to get notifications for.
     * @param notification Notification options and data.
     */
    createNotification = async (user: UserData, notification: Partial<AuthNotification> | Partial<FailedRecipeNotification> | Partial<GearWearNotification>): Promise<void> => {
        try {
            if (!user.id) throw new Error("Invalid user")
            if (!notification.title) throw new Error("Missing notification title")
            if (!notification.body) throw new Error("Missing notification body")

            let lastNotifications: BaseNotification[] = await database.search("notifications", ["userId", "==", user.id], ["dateCreated", "desc"], 1)

            // Check if a similar notification was already created for the user.
            // If so, do not create a new one.
            if (lastNotifications && lastNotifications.length > 0) {
                const last = lastNotifications[0]

                if (!last.read && last.dateExpiry > new Date() && last.title == notification.title && last.body == notification.body) {
                    logger.warn("Notifications.createNotification", `User ${user.id} ${user.displayName}`, `Duplicate of ${last.id}`, notification.title, "Will not create")
                    return
                }
            }

            let logDetails = []
            const now = dayjs().toDate()
            const timestamp = now.valueOf().toString(16)
            const random = Math.floor(Math.random() * Math.floor(9))

            // Set mandatory fields.
            notification.id = `${user.id}-${timestamp}${random}`
            notification.userId = user.id
            notification.dateCreated = now
            notification.read = false

            // Expiry date not set? Use the default based on settings.
            if (!notification.dateExpiry) {
                notification.dateExpiry = dayjs.utc().add(settings.notifications.defaultExpireDays, "days").toDate()
            } else {
                logDetails.push(`Expires ${dayjs(notification.dateExpiry).utc().format("lll")}`)
            }

            // Additional notification details to be logged.
            if (notification["recipeId"]) logDetails.push(`Recipe ID ${notification["recipeId"]}`)
            if (notification["gearwearId"]) logDetails.push(`GearWear ID ${notification["gearwearId"]}`)

            // Save to database and log.
            await database.set("notifications", notification, notification.id)
            logger.info("Notifications.createNotification", `User ${user.id} ${user.displayName}`, `Message ID ${notification.id}`, notification.title, logDetails.join(","))
        } catch (ex) {
            logger.error("Notifications.createNotification", `User ${user.id} ${user.displayName}`, notification.title, ex)
        }
    }

    /**
     * Mark a notification as read. Will return false if notification was already read.
     * @param user The user (owner) of the notification.
     * @param id The notification ID.
     */
    markAsRead = async (user: UserData, id: string): Promise<boolean> => {
        try {
            const notification: BaseNotification = await database.get("notifications", id)

            if (!notification) {
                throw new Error("Message not found")
            }

            // Make sure notification is from the same user.
            if (user.id != notification.userId) {
                throw new Error("Access denied")
            }

            // Message was already marked as read? Return false.
            if (notification.read) {
                const dateRead = dayjs(notification.dateRead).utc().format("lll")
                logger.warn("Notifications.markAsRead", id, `Already read at ${dateRead}`)
                return false
            }

            notification.dateRead = new Date()
            notification.read = true

            // Mark as read on the database.
            await database.merge("notifications", {id: notification.id, dateRead: notification.dateRead, read: notification.read})
            logger.info("Notifications.markAsRead", id, notification.title)

            return true
        } catch (ex) {
            logger.error("Notifications.markAsRead", id, ex)
            throw ex
        }
    }

    // ALERTING
    // --------------------------------------------------------------------------

    /**
     * Send an email reminders with notifications to users that reach
     * the unread threshold (default is 10, via settings).
     */
    sendEmailReminders = async (): Promise<void> => {
        try {
            const now = new Date()
            const queries: any[] = [
                ["read", "==", false],
                ["dateExpiry", ">", now]
            ]

            // Fetch unread notifications and group by users.
            const result = await database.search("notifications", queries)
            const userNotifications = _.groupBy(result, "userId")

            let userId: string
            let list: any

            // Iterate users with unread notifications.
            for ([userId, list] of Object.entries(userNotifications)) {
                try {
                    if (list.length > 0 && list.length % settings.notifications.emailReminderCount == 0) {
                        const user = await users.getById(userId)

                        // Send the email reminder only if user has set an email.
                        if (user.email) {
                            const data = {
                                userId: user.id,
                                userName: user.profile.firstName || user.displayName,
                                notifications: list.map((n) => n.body).join("<br>-<br>"),
                                count: list.length
                            }
                            const options = {
                                to: user.email,
                                template: "UnreadNotifications",
                                data: data
                            }

                            await mailer.send(options)
                            logger.info("Notifications.sendEmailReminders", `User ${user.id} ${user.displayName}`, `${list.length} unread notifications, email sent`)
                        } else {
                            logger.info("Notifications.sendEmailReminders", `User ${user.id} ${user.displayName}`, `${list.length} unread notifications, but no user email set`)
                        }
                    }
                } catch (innerEx) {
                    logger.error("Notifications.sendEmailReminders", `User ${userId}`, innerEx)
                }
            }
        } catch (ex) {
            logger.error("Notifications.sendEmailReminders", ex)
        }
    }

    // MAINTENANCE
    // --------------------------------------------------------------------------

    /**
     * Remove old / read and expired notifications.
     */
    cleanup = async (): Promise<void> => {
        try {
            const date = dayjs.utc().subtract(settings.notifications.readDeleteAfterDays, "days").toDate()

            let counter = 0
            counter += await database.delete("notifications", ["dateRead", "<", date])
            counter += await database.delete("notifications", ["dateExpiry", "<", date])

            logger.info("Notifications.cleanup", `Deleted ${counter} notifications`)
        } catch (ex) {
            logger.error("Notifications.cleanup", ex)
        }
    }
}

// Exports...
export default Notifications.Instance
