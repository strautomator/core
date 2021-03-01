// Strautomator Core: Notifications

import {Announcement, BaseNotification, FailedRecipeNotification, GearWearNotification} from "./types"
import {UserData} from "../users/types"
import database from "../database"
import eventManager from "../eventmanager"
import cache = require("bitecache")
import logger = require("anyhow")
import moment = require("moment")
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
            cache.setup("notifications", settings.notifications.cacheDuration)
            logger.info("Notifications.init")
        } catch (ex) {
            logger.error("Notifications.init", ex)
            throw ex
        }

        eventManager.on("Users.delete", this.onUserDelete)
    }

    /**
     * Delete user notifications after it gets deleted from the database.
     * @param user User that was deleted from the database.
     */
    private onUserDelete = async (user: UserData): Promise<void> => {
        try {
            const counter = await database.delete("notifications", ["userId", "==", user.id])

            if (counter > 0) {
                logger.info("Notifications.onUsersDelete", `User ${user.id} - ${user.displayName}`, `Deleted ${counter} notifications`)
            }
        } catch (ex) {
            logger.error("Notifications.onUsersDelete", `User ${user.id} - ${user.displayName}`, ex)
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
     * Create a notification to the speicified user. It will NOT create a new notification
     * if the contents are the same as the last notification created for the user.
     * @param user The user to get notifications for.
     * @param notification Notification options and data.
     */
    createNotification = async (user: UserData, notification: Partial<FailedRecipeNotification> | Partial<GearWearNotification>): Promise<void> => {
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
            const now = moment().toDate()
            const timestamp = now.valueOf().toString(16)
            const random = Math.floor(Math.random() * Math.floor(9))

            // Set mandatory fields.
            notification.id = `${user.id}-${timestamp}${random}`
            notification.userId = user.id
            notification.dateCreated = now
            notification.read = false

            // Expiry date not set? Use the default based on settings.
            if (!notification.dateExpiry) {
                notification.dateExpiry = moment().utc().add(settings.notifications.defaultExpireDays, "days").toDate()
            } else {
                logDetails.push(`Expires ${moment(notification.dateExpiry).utc().format("lll")}`)
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
                const dateRead = moment(notification.dateRead).utc().format("lll")
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

    // ANNOUNCEMENTS
    // --------------------------------------------------------------------------

    /**
     * Get active announcements.
     * @param includeExpired Optional, if true will return expired announcements as well.
     */
    getAnnouncements = async (includeExpired?: boolean): Promise<Announcement[]> => {
        try {
            const now = new Date()
            const result = await database.search("announcements", [["dateStart", "<=", now]])

            // Remove announcements that have already expired.
            return includeExpired ? result : result.filter((a) => a.dateExpiry >= now)
        } catch (ex) {
            logger.error("Notifications.getAnnouncements", ex)
            throw ex
        }
    }

    /**
     * Create a new global announcement. If an announcement with the same ID exists
     * then it will be overwritten.
     * @param announcement Announcement details.
     */
    setAnnouncement = async (announcement: Announcement): Promise<void> => {
        try {
            if (!announcement.id) throw new Error("Invalid ID")
            if (!announcement.title) throw new Error("Missing announcement title")
            if (!announcement.body) throw new Error("Missing announcement body")
            if (!announcement.dateStart) throw new Error("Missing start date")
            if (!announcement.dateExpiry) throw new Error("Missing expiry date")

            // Make sure announcement ID starts with "ann-".
            if (announcement.id.substring(0, 4) != "ann-") announcement.id = `ann-${announcement.id}`

            // Log start and end date.
            const fromTo = `${moment(announcement.dateStart).format("lll")} till ${moment(announcement.dateExpiry).format("lll")}`

            // Save to database and log.
            await database.set("announcements", announcement, announcement.id)
            logger.info("Notifications.setAnnouncement", `Announcement ID ${announcement.id}`, announcement.title, fromTo)
        } catch (ex) {
            logger.error("Notifications.setAnnouncement", announcement.title, ex)
        }
    }

    // MAINTENANCE
    // --------------------------------------------------------------------------

    /**
     * Remove old and expired notifications and announcements.
     */
    cleanup = async (): Promise<void> => {
        try {
            const notDate = moment().utc().subtract(settings.notifications.readDeleteAfterDays, "days")

            // Delete and count notifications.
            let notCounter = 0
            notCounter += await database.delete("notifications", ["dateRead", "<", notDate])
            notCounter += await database.delete("notifications", ["dateExpiry", "<", notDate])

            // Delete and count announcements.
            let annCounter = await database.delete("announcements", ["dateExpiry", "<", notDate])

            // Log.
            if (annCounter > 0) {
                logger.info("Notifications.cleanup", `Deleted ${notCounter} notifications and ${annCounter} announcements`)
            } else {
                logger.info("Notifications.cleanup", `Deleted ${notCounter} notifications`)
            }
        } catch (ex) {
            logger.error("Notifications.cleanup", ex)
        }
    }
}

// Exports...
export default Notifications.Instance
