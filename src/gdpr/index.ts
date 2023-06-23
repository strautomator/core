// Strautomator Core: GDPR

import {UserData} from "../users/types"
import database from "../database"
import eventManager from "../eventmanager"
import storage from "../storage"
import users from "../users"
import dayjs from "../dayjs"
import path from "path"
import logger from "anyhow"
import * as logHelper from "../loghelper"
import JSZip = require("jszip")
import _ from "lodash"
const settings = require("setmeup").settings

/**
 * GDPR manager.
 */
export class GDPR {
    private static _instance: GDPR
    static get Instance(): GDPR {
        return this._instance || (this._instance = new this())
    }

    /**
     * GDPR startup.
     */
    init = async (): Promise<void> => {
        try {
            logger.info("GDPR.init", `Archives expiration: ${settings.users.archiveDownloadDays} days`)
            eventManager.on("Users.delete", this.onUserDelete)
        } catch (ex) {
            logger.error("GDPR.init", ex)
        }
    }

    /**
     * Delete archives when an user account is deleted.
     * @param user User that was deleted from the database.
     */
    private onUserDelete = async (user: UserData): Promise<void> => {
        try {
            const filename = `${user.id}-${user.urlToken}.zip`
            const file = await storage.getFile("gdpr", filename)

            if (file) {
                await file.delete()
                logger.info("GDPR.onUserDelete", logHelper.user(user), `Deleted archive: ${filename}`)
            }
        } catch (ex) {
            logger.error("GDPR.onUserDelete", logHelper.user(user), ex)
        }
    }

    // ARCHIVES
    // --------------------------------------------------------------------------

    /**
     * User can request a download of all their Strautomator data, archived into
     * a single ZIP file. File is saved in a storage bucket. Returns the full signed
     * URL for the download.
     * @param user The user requesting the data.
     */
    generateArchive = async (user: UserData): Promise<string> => {
        try {
            if (!user || user.suspended) {
                throw new Error("Invalid or suspended user")
            }

            const now = dayjs()
            const extension = settings.beta.enabled ? "-beta.zip" : ".zip"
            const filename = `${user.id}-${user.urlToken}${extension}`
            const saveAs = `strautomator-${user.id}${extension}`
            const minDays = settings.users.archiveDownloadDays
            const lastDownload = user.dateLastArchiveGenerated || dayjs("2000-01-01")
            const diffDays = now.diff(lastDownload, "days")

            // Only one archive download every few days.
            if (diffDays < minDays) {
                const signedUrl = await storage.getUrl("gdpr", filename, saveAs)
                if (signedUrl) {
                    logger.info("GDPR.generateArchive.fromCache", logHelper.user(user), "From cache")
                    return signedUrl
                }
            }

            let size = 0
            let zip = new JSZip()

            // Get all relevant user data from the database.
            const where = [["userId", "==", user.id]]
            const jsonData: any = {}
            jsonData["user"] = await database.get("users", user.id, true)
            jsonData["athlete-records"] = await database.get("athlete-records", user.id, true)
            jsonData["recipe-stats"] = await database.search("recipe-stats", where)
            jsonData["gearwear"] = await database.search("gearwear", where)
            jsonData["activities"] = await database.search("activities", where)
            jsonData["notifications"] = await database.search("notifications", where)
            jsonData["subscriptions"] = await database.search("subscriptions", where)

            // Remove sensitive data.
            delete jsonData["user"].stravaTokens
            delete jsonData["user"].urlToken

            // Iterate and zip database contents for the specified user.
            let key: string
            let data: any
            for ([key, data] of Object.entries(jsonData)) {
                if (!data) continue

                if ((_.isArray(data) && data.length > 0) || Object.values(data).length > 0) {
                    const dataStr = JSON.stringify(data)
                    await zip.file(`${key}.json`, dataStr)
                    size += dataStr.length
                }
            }

            // Get cached calendars.
            const calendarFiles = await storage.listFiles("calendar", `${user.id}/`)
            for (let file of calendarFiles) {
                const icsName = path.basename(file.name).replace(`-${user.urlToken}`, "")
                await zip.file(`calendar-${icsName}`, file.createReadStream())
            }

            // Transform the size to kilobytes.
            size = Math.round(size / 1024)

            // Generate ZIP and push to the storage bucket.
            const result = await zip.generateAsync({type: "nodebuffer", streamFiles: true})
            await storage.setFile("gdpr", filename, result, "application/zip")
            await users.update({id: user.id, displayName: user.displayName, dateLastArchiveGenerated: now.toDate()})

            logger.info("GDPR.generateArchive", logHelper.user(user), `Size: ${size} KB`)

            return await storage.getUrl("gdpr", filename, saveAs)
        } catch (ex) {
            logger.error("GDPR.generateArchive", logHelper.user(user), ex)
            throw ex
        }
    }

    /**
     * Delete archive files from the Storage bucket.
     * @param all If true, all files will be deleted instead of just expired files.
     */
    clearArchives = async (all?: boolean): Promise<void> => {
        try {
            const files = await storage.listFiles("gdpr")
            let count = 0

            // Iterate and delete expired (or all) archives.
            for (let file of files) {
                if (all || file.metadata) {
                    await file.delete()
                    count++
                }
            }

            logger.info("GDPR.clearArchives", all ? "All" : "Just expired", `${count} archives deleted`)
        } catch (ex) {
            logger.error("GDPR.clearArchives", all ? "All" : "Just expired", ex)
        }
    }
}

// Exports...
export default GDPR.Instance
