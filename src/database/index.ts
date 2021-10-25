// Strautomator Core: Database

import {DocumentReference, FieldValue, Firestore, OrderByDirection} from "@google-cloud/firestore"
import {cryptoProcess} from "./crypto"
import _ = require("lodash")
import cache = require("bitecache")
import logger = require("anyhow")
import dayjs from "../dayjs"
const settings = require("setmeup").settings

/**
 * Database wrapper.
 */
export class Database {
    private constructor() {}
    private static _instance: Database
    static get Instance() {
        return this._instance || (this._instance = new this())
    }

    /**
     * Firestore client.
     */
    firestore: Firestore

    // INIT
    // --------------------------------------------------------------------------

    /**
     * Init the Database wrapper.
     */
    init = async (): Promise<void> => {
        try {
            if (!settings.database.crypto.key) {
                throw new Error("Missing the mandatory database.crypto.key setting")
            }

            const options: any = {projectId: settings.gcp.projectId}
            if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
                options.keyFilename = process.env.GOOGLE_APPLICATION_CREDENTIALS
            }

            this.firestore = new Firestore(options)
            this.firestore.settings({ignoreUndefinedProperties: true})

            // Setup bitecache.
            cache.setup("database", settings.database.cacheDuration)

            const suffix = settings.database.collectionSuffix
            const logSuffix = suffix ? `Collections suffixd with "${suffix}"` : "No collection suffix"
            logger.info("Database.init", logSuffix)

            // Read from production?
            if (process.env.NODE_ENV != "production" && settings.database.readProductionSuffix !== null && settings.database.readProductionSuffix !== false) {
                logger.warn("Database.init", "readProductionSuffix is set, data will be read from production")
            } else {
                settings.database.readProductionSuffix = null
            }
        } catch (ex) {
            logger.error("Database.init", ex)
            throw ex
        }
    }

    // DOCUMENT METHODS
    // --------------------------------------------------------------------------

    /**
     * Returns a new (unsaved) document for the specified collection.
     * @param collection Name of the collection.
     * @param id Optional document ID.
     */
    doc = (collection: string, id?: string): DocumentReference => {
        const colname = `${collection}${settings.database.collectionSuffix}`
        return id ? this.firestore.collection(colname).doc(id) : this.firestore.collection(colname).doc()
    }

    /**
     * Update or insert a new document on the specified database collection. Returns epoch timestamp.
     * @param collection Name of the collection.
     * @param data Document data.
     * @param id Unique ID of the document.
     */
    set = async (collection: string, data: any, id: string): Promise<number> => {
        const colname = `${collection}${settings.database.collectionSuffix}`
        const table = this.firestore.collection(colname)
        const doc = table.doc(id)

        // Encrypt relevant data before storing on the database.
        const encryptedData = _.cloneDeep(data)
        cryptoProcess(encryptedData, true)

        const result = await doc.set(encryptedData)

        // Add result to cache if an ID was passed.
        cache.set("database", `${collection}-${id}`, data)

        return result.writeTime.seconds
    }

    /**
     * Similar to set, but accepts a document directly and auto set to merge data. Returns epoch timestamp.
     * @param collection Name of the collection.
     * @param data Data to merge to the document.
     * @param doc The document reference, optional, if not set will fetch from database based on ID.
     */
    merge = async (collection: string, data: any, doc?: DocumentReference): Promise<number> => {
        const encryptedData = _.cloneDeep(data)
        cryptoProcess(encryptedData, true)

        if (!doc) {
            const colname = `${collection}${settings.database.collectionSuffix}`
            const table = this.firestore.collection(colname)
            doc = table.doc(data.id)
        }

        const result = await doc.set(encryptedData, {merge: true})

        // Also merge result on the cache.
        cache.merge("database", `${collection}-${doc.id}`, data)

        return result.writeTime.seconds
    }

    /**
     * Get a single document from the specified database collection.
     * @param collection Name of the collection.
     * @param id ID of the desired document.
     * @param skipCache If set to true, will not lookup on in-memory cache.
     */
    get = async (collection: string, id: string, skipCache?: boolean): Promise<any> => {
        let colname = `${collection}${settings.database.collectionSuffix}`
        if (settings.database.readProductionSuffix !== null) {
            colname = `${collection}${settings.database.readProductionSuffix}`
        }

        // First check if document is cached.
        if (!skipCache && settings.database.cacheDuration) {
            const fromCache = cache.get("database", `${collection}-${id}`)
            if (fromCache) {
                return fromCache
            }
        }

        // Continue here with a regular database fetch.
        const table = this.firestore.collection(colname)
        const doc = await table.doc(id).get()

        if (doc.exists) {
            const result: any = doc.data()

            // Decrypt relevant fields from the database result.
            cryptoProcess(result, false)
            this.transformData(result)
            result.id = doc.id

            // Add result to cache, only if enabled.
            if (settings.database.cacheDuration) {
                cache.set("database", `${collection}-${id}`, result)
            }

            return result
        }

        return null
    }

    /**
     * Search for documents on the specified database collection.
     * @param collection Name of the collection.
     * @param queryList List of query in the format [property, operator, value].
     * @param orderBy Order by field, optional.
     * @param limit Limit results, optional.
     */
    search = async (collection: string, queryList?: any[], orderBy?: string | [string, OrderByDirection], limit?: number): Promise<any[]> => {
        let colname = `${collection}${settings.database.collectionSuffix}`
        if (settings.database.readProductionSuffix !== null) {
            colname = `${collection}${settings.database.readProductionSuffix}`
        }

        let filteredTable: FirebaseFirestore.Query = this.firestore.collection(colname)

        // Make sure query list is an array by itself.
        if (queryList && _.isString(queryList[0])) {
            queryList = [queryList]
        }

        // Iterate and build queries, if any was passed.
        if (queryList) {
            for (let query of queryList) {
                filteredTable = filteredTable.where(query[0], query[1], query[2])
            }
        }

        // Order by field?
        if (orderBy) {
            if (_.isArray(orderBy)) {
                filteredTable = filteredTable.orderBy(orderBy[0], (orderBy as any)[1])
            } else {
                filteredTable = filteredTable.orderBy(orderBy as string)
            }
        }

        // Limit results?
        if (limit) {
            filteredTable = filteredTable.limit(limit)
        }

        const snapshot = await filteredTable.get()
        const results = []

        if (!snapshot.empty) {
            snapshot.forEach((r) => {
                const result = r.data()
                cryptoProcess(result, false)
                this.transformData(result)
                result.id = r.id
                results.push(result)
            })
        }

        return results
    }

    /**
     * Increment a field on the specified document on the database.
     * @param collection Name of the collection.
     * @param id Document ID.
     * @param field Name of the field that should be incremented.
     * @param value Optional increment valud, default is 1, can also be negative.
     */
    increment = async (collection: string, id: string, field: string, value?: number): Promise<void> => {
        const colname = `${collection}${settings.database.collectionSuffix}`
        const table = this.firestore.collection(colname)
        const doc = table.doc(id)

        // Default increment is 1.
        if (!value) {
            value = 1
        }

        // Increment field.
        const data: any = {}
        data[field] = FieldValue.increment(value)
        await doc.update(data)
    }

    /**
     * Delete documents from the database, based on the passed search query,
     * and returns number of deleted documents.
     * @param collection Name of the collection.
     * @param queryOrId ID or query in the format [property, operator, value].
     */
    delete = async (collection: string, queryOrId: any[] | string): Promise<number> => {
        const colname = `${collection}${settings.database.collectionSuffix}`

        if (!queryOrId || queryOrId.length < 1) {
            throw new Error("A valid queryList or ID is mandatory")
        }

        // Check ir an actual ID was passed, or a query list.
        if (_.isString(queryOrId)) {
            const id = queryOrId as string
            await this.firestore.collection(colname).doc(id).delete()

            logger.info("Database.delete", collection, `ID ${id}`, `Deleted`)
            return 1
        } else {
            let filteredTable: FirebaseFirestore.Query = this.firestore.collection(colname).where(queryOrId[0], queryOrId[1], queryOrId[2])

            // Delete documents.
            const snapshot = await filteredTable.get()
            snapshot.forEach((doc) => doc.ref.delete())

            const logQuery = (queryOrId as string[]).join(", ")
            logger.info("Database.delete", collection, logQuery, `Deleted ${snapshot.size} documents`)
            return snapshot.size
        }
    }

    // APP STATE METHODS
    // --------------------------------------------------------------------------

    /**
     * State storage on the database (to share app state across multiple instances).
     */
    appState = {
        /**
         * Get a single document from the specified database collection.
         * @param id ID of the desired state document.
         * @param field The field
         *
         */
        get: async (id: string): Promise<any> => {
            const collection = "app-state"
            const colname = `${collection}${settings.database.collectionSuffix}`

            // Continue here with a regular database fetch.
            const table = this.firestore.collection(colname)
            const doc = await table.doc(id).get()

            if (doc.exists) {
                const result: any = doc.data()
                this.transformData(result)
                return result
            }

            return null
        },
        /**
         * Update state.
         * @param id ID of the desired state document.
         * @param data Data to be saved.
         */
        set: async (id: string, data: any): Promise<void> => {
            const collection = "app-state"
            const colname = `${collection}${settings.database.collectionSuffix}`
            const table = this.firestore.collection(colname)
            const doc = table.doc(id)

            // Save state data to the database.
            await doc.set(data, {merge: true})
        },
        /**
         * Increment a counter on an app state document.
         * @param collection Name of the collection.
         * @param id Document ID.
         * @param field Name of the field that should be incremented.
         * @param value Optional increment valud, default is 1, can also be negative.
         */
        increment: async (id: string, field: string, value?: number): Promise<void> => {
            const collection = "app-state"
            const colname = `${collection}${settings.database.collectionSuffix}`
            const table = this.firestore.collection(colname)
            const doc = table.doc(id)

            // Default increment is 1.
            if (!value) {
                value = 1
            }

            // Increment field.
            const data: any = {}
            data[field] = FieldValue.increment(value)
            await doc.update(data)
        }
    }

    // HELPERS
    // --------------------------------------------------------------------------

    /**
     * Transform result from the database to standard JS formats.
     * Mutates and returns the transformed result.
     * @param data The data to be parsed and (if necessary) transformed.
     */
    transformData = (data: any): any => {
        if (!data) return

        let key: string
        let value: any

        if (_.isArray(data)) {
            for (value of data) {
                if (_.isObject(value)) {
                    this.transformData(value)
                }
            }
        } else {
            for ([key, value] of Object.entries(data)) {
                if (_.isArray(value)) {
                    this.transformData(value)
                } else if (_.isObject(value)) {
                    value = value as any
                    if (value._seconds > 0 && !_.isNil(value._nanoseconds)) {
                        data[key] = value.toDate ? data[key].toDate() : dayjs.unix(value._seconds).toDate()
                    } else {
                        this.transformData(value)
                    }
                }
            }
        }

        return data
    }
}

// Exports...
export default Database.Instance
