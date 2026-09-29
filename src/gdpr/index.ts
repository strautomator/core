// Strautomator Core: GDPR

import {StorageBucket} from "../storage/types"
import {UserData} from "../users/types"
import {Readable} from "stream"
import database from "../database"
import eventManager from "../eventmanager"
import storage from "../storage"
import users from "../users"
import dayjs from "../dayjs"
import path from "path"
import logger from "anyhow"
import * as logHelper from "../loghelper"
import JSZip from "jszip"
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

            // Each JSON file is streamed into the ZIP, fetching collections page by page.
            const jsonFiles = await this.archiveJsonFiles(user, counter)
            for (let file of jsonFiles) {
                zip.file(file.name, file.stream)
            }

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
     * Build the JSON files of the archive, one per data section. Collections are streamed
     * page by page so large accounts are never fully loaded in memory. Empty sections are skipped.
     * @param user The user requesting the data.
     * @param counter Counter with the total size of the generated data.
     */
    private archiveJsonFiles = async (user: UserData, counter: {size: number}): Promise<{name: string; stream: Readable}[]> => {
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
        const sections: {name: string; collection?: string; data?: any}[] = [
            {name: "Activities", collection: "activities"},
            {name: "FitActivities-Garmin", collection: "garmin"},
            {name: "FitActivities-Wahoo", collection: "wahoo"},
            {name: "Automations-Stats", collection: "recipe-stats"},
            {name: "Automations-Shared", collection: "shared-recipes"},
            {name: "AthleteRecords", data: await database.get("athlete-records", user.id)},
            {name: "Calendars", collection: "calendars"},
            {name: "GearWear-Config", collection: "gearwear"},
            {name: "GearWear-BatteryTracker", data: await database.get("gearwear-battery", user.id)},
            {name: "Notifications", collection: "notifications"},
            {name: "Subscription", collection: "subscriptions"},
            {name: "User", data: userData}
        ]

        const files: {name: string; stream: Readable}[] = []

        for (let section of sections) {
            if (section.collection) {
                // Fetch the first page upfront to skip empty collections.
                const pages = database.searchPages(section.collection, where)
                const first = await pages.next()
                if (first.done || first.value.length == 0) continue

                const chunks = async function* (): AsyncGenerator<Buffer> {
                    yield emit("[\n")
                    let page: any[] = first.value
                    let firstItem = true
                    while (true) {
                        yield emit(`${firstItem ? "" : ",\n"}${page.map((item) => JSON.stringify(item, null, 2)).join(",\n")}`)
                        firstItem = false

                        const next = await pages.next()
                        if (next.done) break
                        page = next.value
                    }
                    yield emit("\n]\n")
                }

                files.push({name: `${section.name}.json`, stream: Readable.from(chunks())})
            } else if (section.data) {
                files.push({name: `${section.name}.json`, stream: Readable.from([emit(JSON.stringify(section.data, null, 2))])})
            }
        }

        return files
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
