// Strautomator Core: Messages

import {UserMessage} from "./types"
import {UserData} from "../users/types"
import database from "../database"
import eventManager from "../eventmanager"
import logger = require("anyhow")
import moment = require("moment")
const settings = require("setmeup").settings

/**
 * Messages manager.
 */
export class Messages {
    private constructor() {}
    private static _instance: Messages
    static get Instance() {
        return this._instance || (this._instance = new this())
    }

    // INIT
    // --------------------------------------------------------------------------

    /**
     * Init the Messages manager.
     */
    init = async (): Promise<void> => {
        try {
            logger.info("Messages.init")
        } catch (ex) {
            logger.error("Messages.init", ex)
            throw ex
        }

        eventManager.on("Users.delete", this.onUserDelete)
    }

    /**
     * Delete user messages after it gets deleted from the database.
     * @param user User that was deleted from the database.
     */
    private onUserDelete = async (user: UserData): Promise<void> => {
        try {
            const counter = await database.delete("messages", ["userId", "==", user.id])

            if (counter > 0) {
                logger.info("Messages.onUsersDelete", `User ${user.id} - ${user.displayName}`, `Deleted ${counter} messages`)
            }
        } catch (ex) {
            logger.error("Messages.onUsersDelete", `User ${user.id} - ${user.displayName}`, ex)
        }
    }

    // USER MESSAGES
    // --------------------------------------------------------------------------

    /**
     * Create a message to the speicified user.
     * @param user The user to get messages for.
     * @param title Title of the message.
     * @param body Message body.
     */
    createUserMessage = async (user: UserData, title: string, body: string, dateExpiry?: Date): Promise<UserMessage> => {
        try {
            const now = moment.utc().toDate()
            const timestamp = now.valueOf().toString(16)
            const id = `${user.id}-${timestamp}`

            // Create message object to be saved on the database.
            const result: UserMessage = {
                id: id,
                userId: user.id,
                title: title,
                body: body,
                dateCreated: now
            }

            // Expiry date was set?
            if (dateExpiry) {
                result.dateExpiry = dateExpiry
            }

            await database.set("messages", result, id)

            logger.info("Messages.createUserMessage", `User ${user.id} ${user.displayName}`, title)
            return result
        } catch (ex) {
            logger.error("Messages.createUserMessage", `User ${user.id} ${user.displayName}`, title, ex)
        }
    }

    /**
     * Get list of messages for the specified user.
     * @param user The user to get messages for.
     * @param all If true, will get also read messages, default is false.
     */
    getUserMessages = async (user: UserData, all?: boolean): Promise<UserMessage[]> => {
        try {
            if (!all) all = false

            const result = await database.search("messages", ["userId", "==", user.id])

            logger.info("Messages.getForUser", `User ${user.id} ${user.displayName}`, `All ${all}`, `Got ${result.length} messages`)
            return result
        } catch (ex) {
            logger.error("Messages.getForUser", `User ${user.id} ${user.displayName}`, `All ${all}`, ex)
        }
    }

    // MAINTENANCE
    // --------------------------------------------------------------------------

    /**
     * Remove old and expired messages.
     */
    cleanup = async (): Promise<void> => {
        try {
            const minDate = moment().utc().subtract(settings.messages.readDeleteAfterDays, "d")
            let counter = 0

            counter += await database.delete("messages", ["dateRead", "<", minDate])
            counter += await database.delete("messages", ["dateExpiry", "<", minDate])

            logger.info("Messages.cleanup", `Deleted ${counter} messages`)
        } catch (ex) {
            logger.error("Messages.cleanup", ex)
        }
    }
}

// Exports...
export default Messages.Instance
