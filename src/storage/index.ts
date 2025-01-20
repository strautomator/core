// Strautomator Core: Storage

import {StorageBucket} from "./types"
import * as cloudStorage from "@google-cloud/storage"
import logger from "anyhow"
import dayjs = require("dayjs")
const settings = require("setmeup").settings

/**
 * Storage wrapper.
 */
export class Storage {
    private constructor() {}
    private static _instance: Storage
    static get Instance() {
        return this._instance || (this._instance = new this())
    }

    /**
     * Storage client.
     */
    client: cloudStorage.Storage

    /**
     * List of bucket names that were instantiated.
     */
    buckets: {[id: string]: string}

    // INIT
    // --------------------------------------------------------------------------

    /**
     * Init the Storage wrapper.
     * @param quickStart If true, will not check the cache bucket size and try writing.
     */
    init = async (quickStart?: boolean): Promise<void> => {
        try {
            const existingBuckets: string[] = []
            const options: cloudStorage.StorageOptions = {
                retryOptions: {
                    autoRetry: true,
                    maxRetries: 3
                }
            }

            if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
                options.keyFilename = process.env.GOOGLE_APPLICATION_CREDENTIALS
            }

            this.client = new cloudStorage.Storage(options)
            this.buckets = {}

            let key: string
            let config: any

            for ([key, config] of Object.entries(settings.storage.buckets)) {
                if (!config || !config.name) continue

                if (!quickStart) {
                    const bucket = this.client.bucket(config.name)
                    const [exists] = await bucket.exists()

                    // Create buckets that don't exist yet.
                    if (!exists) {
                        await bucket.create({location: config.location || settings.gcp.location})
                        await bucket.setMetadata({iamConfiguration: {uniformBucketLevelAccess: {enabled: true}}})
                        logger.info("Storage.init", `Created bucket: ${config.name}`)
                    } else {
                        existingBuckets.push(config.name)
                    }

                    // Set the right expiration date by adding a "age" based lifecycle rule, if needed.
                    if (config.ttlDays) {
                        const [metadata] = await bucket.getMetadata()
                        const rules = metadata.lifecycle?.rule || []

                        if (rules.find((r) => r.action?.type == "Delete" && r.condition?.age == config.ttlDays)) {
                            logger.debug("Storage.init", `Bucket ${config.name} TTL already set to ${config.ttlDays} days`)
                        } else {
                            logger.info("Storage.init", `Bucket ${config.name} TTL set to ${config.ttlDays} days`)
                            await bucket.setMetadata({
                                lifecycle: {
                                    rule: [
                                        {
                                            action: {type: "Delete"},
                                            condition: {age: config.ttlDays}
                                        }
                                    ]
                                }
                            })
                        }
                    }
                }

                // Add to list of buckets.
                this.buckets[key] = config.name
            }

            if (existingBuckets.length > 0) {
                logger.info("Storage.init", `Existing buckets: ${existingBuckets.join(", ")}`)
            }

            if (settings.storage.cname) {
                logger.info("Storage.init", "CNAME enabled")
            }
        } catch (ex) {
            logger.error("Storage.init", ex)
            throw ex
        }
    }

    // DOCUMENT METHODS
    // --------------------------------------------------------------------------

    /**
     * List files for the specified bucket.
     * @param bucketKey Key or name of the storage bucket.
     * @param prefix Optional prefix, to limit files from a certain folder.
     */
    listFiles = async (bucketKey: StorageBucket, prefix?: string): Promise<cloudStorage.File[]> => {
        try {
            const bucket: string = this.buckets[bucketKey] || bucketKey
            const options = prefix ? {prefix: prefix} : null
            const [files] = await this.client.bucket(bucket).getFiles(options)

            logger.info("Storage.listFiles", bucketKey, prefix ? prefix : "All", `Got ${files.length} files`)
            return files
        } catch (ex) {
            logger.error("Storage.listFiles", bucketKey, prefix ? prefix : "All", ex)
            throw ex
        }
    }

    /**
     * Returns a file from the specified bucket.
     * @param bucketKey Key or name of the storage bucket.
     * @param filename The full filename.
     * @param silent Avoid logging.
     */
    getFile = async (bucketKey: StorageBucket, filename: string): Promise<cloudStorage.File> => {
        try {
            const bucket: string = this.buckets[bucketKey] || bucketKey
            const file = this.client.bucket(bucket).file(filename)
            const [exists] = await file.exists()
            if (!exists) {
                logger.debug("Storage.getFile", bucketKey, filename, "File not found")
                return null
            }

            logger.debug("Storage.getFile", bucketKey, filename)
            return file
        } catch (ex) {
            logger.error("Storage.getFile", bucketKey, filename, ex)
            throw ex
        }
    }

    /**
     * Downloads the specified file to the target location on the server.
     * @param bucketKey Key or name of the storage bucket.
     * @param filename The full filename.
     * @param targetPath The target file path.
     */
    downloadFile = async (bucketKey: StorageBucket, filename: string, targetPath: string): Promise<boolean> => {
        try {
            const file = await this.getFile(bucketKey, filename)
            if (!file) {
                logger.warn("Storage.downloadFile", bucketKey, filename, targetPath, "Source file not found")
                return false
            }

            await file.download({destination: targetPath})
            logger.info("Storage.downloadFile", bucketKey, filename, targetPath)
            return true
        } catch (ex) {
            logger.error("Storage.downloadFile", bucketKey, filename, targetPath, ex)
            throw ex
        }
    }

    /**
     * Saves the specified file data to the storage bucket.
     * @param bucketKey Key or name of the storage bucket.
     * @param filename The full filename.
     * @param data File data.
     * @param contentType MIME type.
     * @param metadata Optional expiration time in seconds.
     */
    setFile = async (bucketKey: StorageBucket, filename: string, data: string | Buffer, contentType?: string, metadata?: any): Promise<void> => {
        try {
            const bucket: string = this.buckets[bucketKey] || bucketKey
            const file = this.client.bucket(bucket).file(filename)
            await file.save(data, {contentType: contentType ? contentType : "auto", resumable: false})

            // Set the metadata, if set.
            if (metadata) {
                await file.setMetadata(metadata)
            }

            logger.info("Storage.setFile", bucketKey, filename)
        } catch (ex) {
            logger.error("Storage.setFile", bucketKey, filename, ex)
            throw ex
        }
    }

    /**
     * Delete the specified file from the storage bucket.
     * @param bucketKey Key or name of the storage bucket.
     * @param filename The full filename.
     */
    deleteFile = async (bucketKey: StorageBucket, filename: string): Promise<void> => {
        try {
            const file = await this.getFile(bucketKey, filename)
            if (!file) {
                logger.debug("Storage.deleteFile", bucketKey, filename, "File not found")
                return
            }

            await file.delete({ignoreNotFound: true})
            logger.info("Storage.deleteFile", bucketKey, filename)
        } catch (ex) {
            logger.error("Storage.deleteFile", bucketKey, filename, ex)
            throw ex
        }
    }

    /**
     * Helper to get a signed URL for the specified file.
     * @param bucketKey Key or name of the storage bucket.
     * @param filename The full filename.
     * @param save Optional "save as" target filename.
     * @param contentType Optional, override the target content type.
     */
    getUrl = async (bucketKey: StorageBucket, filename: string, saveAs?: string, contentType?: string): Promise<string> => {
        const file = await this.getFile(bucketKey, filename)
        if (!file) return null

        const urlConfig: cloudStorage.GetSignedUrlConfig = {
            action: "read",
            version: "v4",
            expires: dayjs().add(12, "hours").toDate(),
            promptSaveAs: saveAs
        }

        // Optional "save as" and content type.
        if (saveAs) {
            urlConfig.promptSaveAs = saveAs
        }
        if (contentType) {
            urlConfig.contentType = contentType
        }

        if (settings.storage.cname) {
            urlConfig.cname = `https://${this.buckets[bucketKey]}`
        }

        const [signedUrl] = await file.getSignedUrl(urlConfig)
        logger.info("Storage.getUrl", bucketKey, filename)

        return signedUrl
    }
}

// Exports...
export default Storage.Instance
