// Strautomator Core: GDPR

import {StorageBucket} from "../storage/types"
import {UserData} from "../users/types"
import database from "../database"
import eventManager from "../eventmanager"
import storage from "../storage"
import users from "../users"
import dayjs from "../dayjs"
import path from "path"
import logger from "anyhow"
import * as logHelper from "../loghelper"
import JSZip from "jszip"
import {Readable} from "stream"
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
            logger.info("GDPR.init", `Archives expiration: ${settings.gdpr.requestDays} days`)
            eventManager.on("Users.delete", this.onUserDelete)
        } catch (ex) {
            logger.error("GDPR.init", ex)
        }
    }

    /**
     * Delete archives and cache when an user account is deleted.
     * @param user User that was deleted from the database.
     */
    private onUserDelete = async (user: UserData): Promise<void> => {
        try {
            const filename = `${user.id}-${user.urlToken}.zip`
            const file = await storage.getFile(StorageBucket.GDPR, filename)

            if (file) {
                await file.delete()
                logger.info("GDPR.onUserDelete", logHelper.user(user), `Deleted archive: ${filename}`)
            }
        } catch (ex) {
            logger.warn("GDPR.onUserDelete", logHelper.user(user), "Failed, no problem as archives files will be auto-deleted in a few days")
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
            const extension = ".zip"
            const filename = `${user.id}-${user.urlToken}${extension}`
            const saveAs = `strautomator-${user.id}${extension}`
            const minDays = settings.gdpr.requestDays
            const lastDownload = user.dateLastArchiveGenerated || dayjs("2000-01-01")
            const diffDays = now.diff(lastDownload, "days")

            // Only one archive download every few days.
            if (diffDays < minDays) {
                const signedUrl = await storage.getUrl(StorageBucket.GDPR, filename, saveAs)
                if (signedUrl) {
                    logger.info("GDPR.generateArchive.fromCache", logHelper.user(user), "From cache")
                    return signedUrl
                }
            }

            const zip = new JSZip()
            const counter = {size: 0}

            // The data.json is streamed into the ZIP, fetching collections page by page.
            zip.file("data.json", Readable.from(this.archiveDataChunks(user, counter)))

            // Get cached calendars.
            const calendarFiles = await storage.listFiles(StorageBucket.Calendar, `${user.id}/`)
            for (let file of calendarFiles) {
                const icsName = path.basename(file.name).replace(`-${user.urlToken}`, "")
                zip.file(`calendar-${icsName}`, file.createReadStream())
            }

            // Generate ZIP and stream it to the storage bucket.
            const zipStream = zip.generateNodeStream({type: "nodebuffer", streamFiles: true, compression: "DEFLATE"})
            await storage.setFileStream(StorageBucket.GDPR, filename, zipStream, "application/zip")
            await users.update({id: user.id, displayName: user.displayName, dateLastArchiveGenerated: now.toDate()})

            logger.info("GDPR.generateArchive", logHelper.user(user), `Size: ${Math.round(counter.size / 1024)} KB`)

            return await storage.getUrl(StorageBucket.GDPR, filename, saveAs)
        } catch (ex) {
            logger.error("GDPR.generateArchive", logHelper.user(user), ex)
            throw ex
        }
    }

    /**
     * Generate the contents of the archive's data.json in chunks, with collections fetched
     * page by page so large accounts are never fully loaded in memory.
     * @param user The user requesting the data.
     * @param counter Counter with the total size of the generated data.
     */
    private async *archiveDataChunks(user: UserData, counter: {size: number}): AsyncGenerator<Buffer> {
        const where = [["userId", "==", user.id]]

        // JSZip needs Buffer chunks, as strings from object streams are not decoded as UTF-8.
        const emit = (chunk: string): Buffer => {
            const buffer = Buffer.from(chunk, "utf8")
            counter.size += buffer.length
            return buffer
        }

        // Remove sensitive data from the user.
        const userData = await database.get("users", user.id)
        if (userData) {
            delete userData.stravaTokens
            delete userData.urlToken
            delete userData.garminAuthState
            delete userData.wahooAuthState
            delete userData.spotifyAuthState
            if (userData.garmin) delete userData.garmin.tokens
            if (userData.wahoo) delete userData.wahoo.tokens
            if (userData.spotify) delete userData.spotify.tokens
        }

        // Sections of the exported data: either a collection (streamed) or a single document.
        const sections: {path: string[]; collection?: string; data?: any}[] = [
            {path: ["Activities"], collection: "activities"},
            {path: ["FitActivities", "Garmin"], collection: "garmin"},
            {path: ["FitActivities", "Wahoo"], collection: "wahoo"},
            {path: ["Automations", "Stats"], collection: "recipe-stats"},
            {path: ["Automations", "Shared"], collection: "shared-recipes"},
            {path: ["AthleteRecords"], data: await database.get("athlete-records", user.id)},
            {path: ["Calendars"], collection: "calendars"},
            {path: ["GearWear", "Config"], collection: "gearwear"},
            {path: ["GearWear", "BatteryTracker"], data: await database.get("gearwear-battery", user.id)},
            {path: ["Notifications"], collection: "notifications"},
            {path: ["Subscription"], collection: "subscriptions"},
            {path: ["User"], data: userData}
        ]

        yield emit("{")
        let parent: string = null
        let firstKey = true
        let firstChildKey = true

        for (let section of sections) {
            const [key, childKey] = section.path

            // Open or close the parent object for nested sections.
            if (parent && parent != key) {
                yield emit("}")
                parent = null
            }
            if (childKey && parent != key) {
                yield emit(`${firstKey ? "" : ","}\n${JSON.stringify(key)}:{`)
                parent = key
                firstKey = false
                firstChildKey = true
            }

            const prefix = childKey ? `${firstChildKey ? "" : ","}\n${JSON.stringify(childKey)}:` : `${firstKey ? "" : ","}\n${JSON.stringify(key)}:`
            if (childKey) firstChildKey = false
            else firstKey = false

            if (section.collection) {
                yield emit(`${prefix}[`)
                let firstItem = true
                for await (const page of database.searchPages(section.collection, where)) {
                    const items = page.map((item) => JSON.stringify(item)).join(",\n")
                    yield emit(`${firstItem ? "\n" : ",\n"}${items}`)
                    firstItem = false
                }
                yield emit("]")
            } else {
                yield emit(`${prefix}${JSON.stringify(section.data || null)}`)
            }
        }

        if (parent) {
            yield emit("}")
        }
        yield emit("\n}\n")
    }

    /**
     * Delete archive files from the Storage bucket.
     * @param all If true, all files will be deleted instead of just expired files.
     */
    clearArchives = async (all?: boolean): Promise<void> => {
        try {
            const files = await storage.listFiles(StorageBucket.GDPR)
            const ttlDays = settings.storage.buckets.gdpr.ttlDays || settings.gdpr.requestDays
            const cutoff = Date.now() - ttlDays * 86400000
            let count = 0

            // Iterate and delete expired (or all) archives.
            for (let file of files) {
                if (all || (file.metadata?.timeCreated && new Date(file.metadata.timeCreated).getTime() <= cutoff)) {
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
