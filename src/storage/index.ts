// Strautomator Core: Storage

import * as cloudStorage from "@google-cloud/storage"
import logger = require("anyhow")
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

    // INIT
    // --------------------------------------------------------------------------

    /**
     * Init the Storage wrapper.
     * @param quickStart If true, will not check the cache bucket size and try writing.
     */
    init = async (quickStart?: boolean): Promise<void> => {
        try {
            const options: any = {}

            if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
                options.keyFilename = process.env.GOOGLE_APPLICATION_CREDENTIALS
            }

            this.client = new cloudStorage.Storage(options)

            if (!quickStart) {
                const cachedFiles = await this.listFiles(settings.storage.cacheBucket)
                logger.info("Storage.init", `${cachedFiles.length || "No"} files in the cache bucket`)
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
     * @param bucket Name of the storage bucket.
     */
    listFiles = async (bucket: string): Promise<cloudStorage.File[]> => {
        try {
            const [files] = await this.client.bucket(bucket).getFiles()
            logger.info("Storage.listFiles", bucket, `Got ${files.length} files`)

            return files
        } catch (ex) {
            logger.error("Storage.listFiles", bucket, ex)
            throw ex
        }
    }

    /**
     * Returns a file from the specified bucket.
     * @param bucket Name of the storage bucket.
     * @param filename The full filename.
     */
    getFile = async (bucket: string, filename: string): Promise<cloudStorage.File> => {
        try {
            const file = this.client.bucket(bucket).file(filename)
            const [exists] = await file.exists()

            if (!exists) {
                logger.warn("Storage.getFile", bucket, filename, "Not found")
                return null
            }

            logger.info("Storage.getFile", bucket, filename)
            return file
        } catch (ex) {
            logger.error("Storage.getFile", bucket, filename, ex)
            throw ex
        }
    }

    /**
     * Downloads the specified file to the target location.
     * @param bucket Name of the storage bucket.
     * @param filename The full filename.
     * @param targetPath The target file path.
     */
    downloadFile = async (bucket: string, filename: string, targetPath: string): Promise<boolean> => {
        try {
            const file = await this.getFile(bucket, filename)

            if (file) {
                await file.download({destination: targetPath})
                logger.info("Storage.downloadFile", bucket, filename, targetPath)
                return true
            }

            logger.warn("Storage.downloadFile", bucket, filename, targetPath, "Source file not found")
            return false
        } catch (ex) {
            logger.error("Storage.downloadFile", bucket, filename, targetPath, ex)
            throw ex
        }
    }

    /**
     * Saves the specified file data to the storage bucket.
     * @param bucket Name of the storage bucket.
     * @param filename The full filename.
     * @param data File data.
     */
    setFile = async (bucket: string, filename: string, data: any): Promise<void> => {
        try {
            const file = this.client.bucket(bucket).file(filename)
            await file.save(data)

            logger.info("Storage.setFile", bucket, filename)
        } catch (ex) {
            logger.error("Storage.setFile", bucket, filename, ex)
            throw ex
        }
    }
}

// Exports...
export default Storage.Instance
