// Strautomator Core: FIT Upload

import {FitFileActivity, FitUploadCallbacks, FitUploadResult} from "./types"
import {UserData} from "../users/types"
import {Readable} from "stream"
import {promisify} from "util"
import fitparser from "./index"
import garminActivities from "../garmin/activities"
import wahooActivities from "../wahoo/activities"
import JSZip from "jszip"
import logger from "anyhow"
import path from "path"
import zlib from "zlib"
import * as logHelper from "../loghelper"
const settings = require("setmeup").settings

const inflateRaw = promisify(zlib.inflateRaw)

/**
 * Bounds for the zlib output chunk hint, so usual sized FIT files inflate into a single buffer.
 */
const minChunkSize = 16384
const maxChunkSize = 1048576

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
     * @param contentLength Archive size declared by the client, if any.
     */
    processZip = async (user: UserData, zipStream: Readable, callbacks?: FitUploadCallbacks, contentLength?: number): Promise<FitUploadResult[]> => {
        const results: FitUploadResult[] = []
        const maxFiles = settings.fitparser.upload.maxFiles
        const maxFileSize = settings.fitparser.upload.maxFileSize

        try {
            const zip = await JSZip.loadAsync(await this.readStream(zipStream, contentLength))

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

            // Cap the real inflated bytes. Header sizes are only an early reject because they can be forged.
            const maxExpandedSize = settings.fitparser.upload.maxExpandedSize
            let totalSize = 0

            for (let entry of targetEntries) {
                const filename = path.posix.basename(entry.name)
                let result: FitUploadResult
                const declaredSize = (entry as any)._data?.uncompressedSize || 0
                const remaining = maxExpandedSize - totalSize

                if (declaredSize > remaining) {
                    throw new Error(`Archive uncompressed size is bigger than ${Math.round(maxExpandedSize / 1024 / 1024)}MB`)
                }
                if (declaredSize > maxFileSize) {
                    result = {filename: filename, error: `File is bigger than ${Math.round(maxFileSize / 1024 / 1024)}MB`}
                } else {
                    const maxBytes = Math.min(maxFileSize, remaining)
                    try {
                        const rawData = await this.readEntry(entry, maxBytes)
                        totalSize += rawData.length
                        result = await this.processFile(user, filename, rawData)
                    } catch (ex) {
                        if (ex?.name === "FitEntryTooLarge") {
                            if (maxBytes < maxFileSize) {
                                throw new Error(`Archive uncompressed size is bigger than ${Math.round(maxExpandedSize / 1024 / 1024)}MB`)
                            }
                            result = {filename: filename, error: ex.message}
                        } else {
                            throw ex
                        }
                    }
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
     * Decompress one archive entry, stopping once the output passes maxBytes.
     * Header sizes are not trusted: the cap is enforced against the real inflated bytes.
     * @param entry ZIP entry to read.
     * @param maxBytes Maximum number of inflated bytes to accept.
     */
    private readEntry = async (entry: JSZip.JSZipObject, maxBytes: number): Promise<Buffer> => {
        const data = (entry as any)._data
        const compressed = data?.compressedContent
        const method = data?.compression?.magic
        const source = compressed ? (Buffer.isBuffer(compressed) ? compressed : Buffer.from(compressed)) : null

        // Stored entries are already the final payload.
        if (source && method === "\x00\x00") {
            if (source.length > maxBytes) throw this.entryTooLarge(maxBytes)
            return source
        }

        // Deflated entries go through zlib, which enforces the cap natively and aborts mid-stream.
        // The declared size is only used as a chunk hint, so most files skip the final concat.
        if (source && method === "\x08\x00") {
            const chunkSize = Math.min(Math.max(data.uncompressedSize || 0, minChunkSize), maxChunkSize, maxBytes)
            try {
                return await inflateRaw(source, {maxOutputLength: maxBytes, chunkSize: chunkSize})
            } catch (ex) {
                throw ex.code === "ERR_BUFFER_TOO_LARGE" ? this.entryTooLarge(maxBytes) : ex
            }
        }

        return await this.readEntryStream(entry, maxBytes)
    }

    /**
     * Fallback for entries not exposing their internal compressed data, aborting as soon
     * as the output passes maxBytes.
     * @param entry ZIP entry to read.
     * @param maxBytes Maximum number of inflated bytes to accept.
     */
    private readEntryStream = (entry: JSZip.JSZipObject, maxBytes: number): Promise<Buffer> => {
        return new Promise((resolve, reject) => {
            const stream = (entry as any).internalStream("nodebuffer")
            let chunks: Buffer[] = []
            let size = 0
            let done = false

            const fail = (error: Error) => {
                if (done) return
                done = true
                chunks = []
                stream.pause()
                reject(error)
            }

            stream.on("data", (chunk: Buffer) => {
                if (done) return
                size += chunk.length
                if (size > maxBytes) return fail(this.entryTooLarge(maxBytes))
                chunks.push(chunk)
            })
            stream.on("error", fail)
            stream.on("end", () => {
                if (done) return
                done = true
                resolve(Buffer.concat(chunks, size))
            })
            stream.resume()
        })
    }

    /**
     * Error used when an inflated FIT entry passes its byte cap.
     * @param maxBytes The cap that was exceeded.
     */
    private entryTooLarge = (maxBytes: number): Error => {
        const error = new Error(`File is bigger than ${Math.round(maxBytes / 1024 / 1024)}MB`)
        error.name = "FitEntryTooLarge"
        return error
    }

    /**
     * Read the uploaded archive from the request stream, aborting as soon as it goes over
     * the maximum allowed size. A declared content length lets the archive be read into a
     * single pre-allocated buffer, avoiding the extra full copy made by Buffer.concat.
     * @param zipStream Readable stream with the ZIP archive contents.
     * @param contentLength Archive size declared by the client, if any.
     */
    private readStream = async (zipStream: Readable, contentLength?: number): Promise<Buffer> => {
        const maxSize = settings.fitparser.upload.maxSize

        return new Promise((resolve, reject) => {
            const target = contentLength > 0 && contentLength <= maxSize ? Buffer.allocUnsafe(contentLength) : null
            const chunks: Buffer[] = []
            let totalBytes = 0

            zipStream.on("data", (chunk) => {
                totalBytes += chunk.length
                if (totalBytes > maxSize) {
                    zipStream.destroy()
                    return reject(new Error(`Archive is bigger than ${Math.round(maxSize / 1024 / 1024)}MB`))
                }
                if (!target) {
                    chunks.push(Buffer.from(chunk))
                } else if (totalBytes > target.length) {
                    zipStream.destroy()
                    return reject(new Error("Archive is bigger than its declared content length"))
                } else {
                    chunk.copy(target, totalBytes - chunk.length)
                }
            })
            zipStream.on("error", reject)

            // Only the bytes actually received are exposed, so the target is never read uninitialized.
            zipStream.on("end", () => resolve(target ? target.subarray(0, totalBytes) : Buffer.concat(chunks, totalBytes)))
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
