// Strautomator Core: FIT Upload

import {FitFileActivity, FitUploadCallbacks, FitUploadResult} from "./types"
import {UserData} from "../users/types"
import {Readable} from "stream"
import fitparser from "./index"
import garminActivities from "../garmin/activities"
import wahooActivities from "../wahoo/activities"
import JSZip from "jszip"
import logger from "anyhow"
import path from "path"
import * as logHelper from "../loghelper"
const settings = require("setmeup").settings

/**
 * Processing of ZIP archives with FIT files uploaded by the users.
 */
export class FitUpload {
    private constructor() {}
    private static _instance: FitUpload
    static get Instance() {
        return this._instance || (this._instance = new this())
    }

    /**
     * Extract and process the FIT files of an uploaded ZIP archive. Files are decompressed
     * and parsed one by one, so only a single FIT file is expanded in memory at any given time.
     * Results are passed to the optional callbacks as soon as each file gets processed, and
     * the full list is returned at the end.
     * @param user The user that has uploaded the archive.
     * @param zipStream Readable stream with the ZIP archive contents.
     * @param callbacks Optional callbacks triggered while the archive is processed.
     */
    processZip = async (user: UserData, zipStream: Readable, callbacks?: FitUploadCallbacks): Promise<FitUploadResult[]> => {
        const results: FitUploadResult[] = []
        const maxFiles = settings.fitparser.upload.maxFiles
        const maxFileSize = settings.fitparser.upload.maxFileSize

        try {
            const zip = await JSZip.loadAsync(await this.readStream(zipStream))

            // Only consider FIT files, ignoring directories, hidden and metadata files.
            const entries = Object.values(zip.files).filter((entry) => {
                const filename = path.posix.basename(entry.name || "")
                return !entry.dir && !filename.startsWith(".") && filename.toLowerCase().endsWith(".fit")
            })

            // Files past the limit are simply discarded.
            const targetEntries = entries.slice(0, maxFiles)
            if (callbacks?.onStart) {
                await callbacks.onStart(targetEntries.length)
            }

            for (let entry of targetEntries) {
                const filename = path.posix.basename(entry.name)
                let result: FitUploadResult

                // The uncompressed size is only exposed via the internal entry data.
                const fileSize = (entry as any)._data?.uncompressedSize || 0

                if (fileSize > maxFileSize) {
                    result = {filename: filename, error: `File is bigger than ${Math.round(maxFileSize / 1024 / 1024)}MB`}
                } else {
                    result = await this.processFile(user, filename, await entry.async("nodebuffer"))
                }

                results.push(result)

                if (callbacks?.onFile) {
                    await callbacks.onFile(result)
                }
            }

            const failedCount = results.filter((r) => r.error).length
            logger.info("FitUpload.processZip", logHelper.user(user), `Processed ${results.length - failedCount} activities`, `${failedCount} failed`)

            return results
        } catch (ex) {
            logger.error("FitUpload.processZip", logHelper.user(user), `Processed ${results.length} files so far`, ex)
            throw ex
        }
    }

    /**
     * Read the uploaded archive from the request stream, aborting as soon as it goes over
     * the maximum allowed size.
     * @param zipStream Readable stream with the ZIP archive contents.
     */
    private readStream = async (zipStream: Readable): Promise<Buffer> => {
        const maxSize = settings.fitparser.upload.maxSize

        return new Promise((resolve, reject) => {
            const chunks: Buffer[] = []
            let totalBytes = 0

            zipStream.on("data", (chunk) => {
                totalBytes += chunk.length
                if (totalBytes > maxSize) {
                    zipStream.destroy()
                    return reject(new Error(`Archive is bigger than ${Math.round(maxSize / 1024 / 1024)}MB`))
                }
                chunks.push(Buffer.from(chunk))
            })
            zipStream.on("error", reject)
            zipStream.on("end", () => resolve(Buffer.concat(chunks)))
        })
    }

    /**
     * Parse a single FIT file and ingest it via the Garmin or Wahoo processor, depending
     * on the device that has generated the file. Failures are returned as part of the
     * result, so a single invalid file won't stop the rest of the batch.
     * @param user The user that has uploaded the file.
     * @param filename Name of the file inside the archive.
     * @param rawData The FIT raw data.
     */
    private processFile = async (user: UserData, filename: string, rawData: Buffer): Promise<FitUploadResult> => {
        const activity: FitFileActivity = {userId: user.id, profileId: null, id: filename, name: null}

        try {
            const parsed = await fitparser.parse(user, activity, rawData)
            const manufacturer = parsed.manufacturer
            const source = manufacturer?.includes("garmin") ? "garmin" : manufacturer?.includes("wahoo") ? "wahoo" : null

            if (!source) {
                throw new Error(manufacturer ? `Unsupported device: ${manufacturer}` : "Could not identify the device")
            }
            if (source == "garmin") {
                await garminActivities.processUploadedActivity(user, activity)
            } else {
                await wahooActivities.processUploadedActivity(user, activity)
            }

            return {...activity, filename: filename, source: source}
        } catch (ex) {
            logger.error("FitUpload.processFile", logHelper.user(user), filename, ex)
            return {filename: filename, error: ex.message || ex.toString()}
        }
    }
}

// Exports...
export default FitUpload.Instance
