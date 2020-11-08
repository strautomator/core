// Strautomator Core: Notifications

import {BaseNotification, FailedRecipeNotification, GearWearNotification} from "./types"
import {UserData} from "../users/types"
import database from "../database"
import eventManager from "../eventmanager"
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
        try {
            const now = new Date()
            const queries: any[] = [["userId", "==", user.id]]

            // Not all? Filter unread and non-expired notifications.
            if (!all) {
                queries.push(["read", "==", false])
                queries.push(["dateExpiry", ">", now])
            }

            // Fetch notifications from the database.
            const result = await database.search("notifications", queries)

            logger.info("Notifications.getForUser", `User ${user.id} ${user.displayName}`, `All ${all}`, `Got ${result.length} notification(s)`)
            return result
        } catch (ex) {
            logger.error("Notifications.getForUser", `User ${user.id} ${user.displayName}`, `All ${all}`, ex)
            throw ex
        }
    }

    /**
     * Create a notification to the speicified user.
     * @param user The user to get notifications for.
     * @param notification Notification options and data.
     */
    createNotification = async (user: UserData, notification: Partial<FailedRecipeNotification> | Partial<GearWearNotification>): Promise<void> => {
        try {
            if (!user.id) throw new Error("Invalid user")
            if (!notification.title) throw new Error("Missing notification title")
            if (!notification.body) throw new Error("Missing notification body")

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
            logger.info("Notifications.createUserMessage", `User ${user.id} ${user.displayName}`, `Message ID ${notification.id}`, notification.title, logDetails.join(","))
        } catch (ex) {
            logger.error("Notifications.createUserMessage", `User ${user.id} ${user.displayName}`, notification.title, ex)
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

    // MAINTENANCE
    // --------------------------------------------------------------------------

    /**
     * Remove old and expired notifications.
     */
    cleanup = async (): Promise<void> => {
        try {
            const minDate = moment().utc().subtract(settings.notifications.readDeleteAfterDays, "days")
            let counter = 0

            counter += await database.delete("notifications", ["dateRead", "<", minDate])
            counter += await database.delete("notifications", ["dateExpiry", "<", minDate])

            logger.info("Notifications.cleanup", `Deleted ${counter} notifications`)
        } catch (ex) {
            logger.error("Notifications.cleanup", ex)
        }
    }
}

// Exports...
export default Notifications.Instance
