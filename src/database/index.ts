// Strautomator Core: Database

import {DocumentReference, FieldValue, Firestore, OrderByDirection} from "@google-cloud/firestore"
import {DatabaseOptions} from "./types"
import {cryptoProcess} from "./crypto"
import _ from "lodash"
import cache = require("bitecache")
import jaul = require("jaul")
import logger = require("anyhow")
import dayjs from "../dayjs"
const settings = require("setmeup").settings
const deadlineTimeout = 1500

/**
 * Database wrapper.
 */
export class Database {
    private constructor() {}
    private static _instance: Database
    static get Instance() {
        return this._instance || (this._instance = new this())
    }
    static newInstance() {
        return new this()
    }

    /**
     * Database collection suffix.
     */
    collectionSuffix: string

    /**
     * Firestore client.
     */
    firestore: Firestore

    // INIT
    // --------------------------------------------------------------------------

    /**
     * Init the Database wrapper.
     * @param dbOptions Custom database access options (ie. for beta deployments).
     */
    init = async (dbOptions?: DatabaseOptions): Promise<void> => {
        try {
            const customLog = dbOptions ? dbOptions.description : "Default connection"
            dbOptions = _.defaultsDeep(dbOptions || {}, settings.database)

            // Crypto key is global and required.
            if (!settings.database.crypto.key) {
                throw new Error("Missing the mandatory database.crypto.key setting")
            }

            const options: FirebaseFirestore.Settings = {projectId: settings.gcp.projectId}
            if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
                options.keyFilename = process.env.GOOGLE_APPLICATION_CREDENTIALS
            }

            this.firestore = new Firestore(options)
            this.firestore.settings({ignoreUndefinedProperties: dbOptions.ignoreUndefinedProperties})
            this.collectionSuffix = dbOptions.collectionSuffix || ""

            // Setup bitecache.
            cache.setup(`database${this.collectionSuffix}`, dbOptions.cacheDuration)

            const logSuffix = this.collectionSuffix ? `Collections suffixd with "${this.collectionSuffix}"` : "No collection suffix"
            logger.info("Database.init", customLog, logSuffix)
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
     * @param collectionSuffix Optional collection suffix to override the default one.
     */
    doc = (collection: string, id?: string, collectionSuffix?: string): DocumentReference => {
        const colname = `${collection}${collectionSuffix || this.collectionSuffix}`
        return id ? this.firestore.collection(colname).doc(id) : this.firestore.collection(colname).doc()
    }

    /**
     * Update or insert a new document on the specified database collection. Returns epoch timestamp.
     * @param collection Name of the collection.
     * @param data Document data.
     * @param id Unique ID of the document.
     */
    set = async (collection: string, data: any, id: string): Promise<number> => {
        const colname = `${collection}${this.collectionSuffix}`
        const table = this.firestore.collection(colname)
        const doc = table.doc(id)

        // Encrypt relevant data before storing on the database.
        const encryptedData = _.cloneDeep(data)
        cryptoProcess(encryptedData, true)

        // Set the document, save to cache and return it.
        try {
            const result = await doc.set(encryptedData)
            cache.set(`database${this.collectionSuffix}`, `${collection}-${id}`, data)

            return result.writeTime.seconds
        } catch (ex) {
            if (ex.toString().includes("DEADLINE_EXCEEDED")) {
                await jaul.io.sleep(deadlineTimeout)

                const result = await doc.set(encryptedData)
                cache.set(`database${this.collectionSuffix}`, `${collection}-${id}`, data)

                return result.writeTime.seconds
            } else {
                throw ex
            }
        }
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
            const colname = `${collection}${this.collectionSuffix}`
            const table = this.firestore.collection(colname)
            doc = table.doc(data.id)
        }

        // Merge the data, save to cache and return it.
        try {
            const result = await doc.set(encryptedData, {merge: true})
            cache.merge(`database${this.collectionSuffix}`, `${collection}-${doc.id}`, data)

            return result.writeTime.seconds
        } catch (ex) {
            if (ex.toString().includes("DEADLINE_EXCEEDED")) {
                await jaul.io.sleep(deadlineTimeout)

                const result = await doc.set(encryptedData, {merge: true})
                cache.merge(`database${this.collectionSuffix}`, `${collection}-${doc.id}`, data)

                return result.writeTime.seconds
            } else {
                throw ex
            }
        }
    }

    /**
     * Get a single document from the specified database collection.
     * @param collection Name of the collection.
     * @param id ID of the desired document.
     * @param skipCache If set to true, will not lookup on in-memory cache.
     */
    get = async (collection: string, id: string, skipCache?: boolean): Promise<any> => {
        let colname = `${collection}${this.collectionSuffix}`

        // First check if document is cached.
        if (!skipCache && settings.database.cacheDuration) {
            const fromCache = cache.get(`database${this.collectionSuffix}`, `${collection}-${id}`)
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
                cache.set(`database${this.collectionSuffix}`, `${collection}-${id}`, result)
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
        let colname = `${collection}${this.collectionSuffix}`
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
     * Count how many documents are returned for the specified query.
     * @param collection Name of the collection.
     * @param queryList List of query in the format [property, operator, value].
     */
    count = async (collection: string, queryList?: any[]): Promise<number> => {
        let colname = `${collection}${this.collectionSuffix}`
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

        // Return the snapshop count.
        const snapshot = await filteredTable.count().get()
        return snapshot.data().count
    }

    /**
     * Increment a field on the specified document on the database.
     * @param collection Name of the collection.
     * @param id Document ID.
     * @param field Name of the field that should be incremented.
     * @param value Optional increment valud, default is 1, can also be negative.
     */
    increment = async (collection: string, id: string, field: string, value?: number): Promise<void> => {
        const colname = `${collection}${this.collectionSuffix}`
        const table = this.firestore.collection(colname)
        const doc = table.doc(id)

        // Default increment is 1.
        if (!value) {
            value = 1
        }

        // Increment field.
        const data: any = {}
        data[field] = FieldValue.increment(value)

        try {
            await doc.update(data)
        } catch (ex) {
            if (ex.toString().includes("DEADLINE_EXCEEDED")) {
                await jaul.io.sleep(deadlineTimeout)
                await doc.update(data)
            } else {
                throw ex
            }
        }
    }

    /**
     * Delete documents from the database, based on the passed search query,
     * and returns number of deleted documents.
     * @param collection Name of the collection.
     * @param queryOrId ID or query / queries in the format [property, operator, value].
     */
    delete = async (collection: string, queryOrId: string | any[]): Promise<number> => {
        const colname = `${collection}${this.collectionSuffix}`

        if (!queryOrId || queryOrId.length < 1) {
            throw new Error("A valid queryList or ID is mandatory")
        }

        // Check ir an actual ID was passed, or a query list.
        if (_.isString(queryOrId)) {
            const id = queryOrId as string
            cache.del(`database${this.collectionSuffix}`, `${collection}-${id}`)
            await this.firestore.collection(colname).doc(id).delete()

            logger.info("Database.delete", collection, `ID ${id}`, `Deleted`)
            return 1
        } else {
            let filteredTable: FirebaseFirestore.Query = this.firestore.collection(colname)
            let where: any = _.isString(queryOrId[0]) ? [queryOrId] : queryOrId

            for (let query of where) {
                filteredTable = filteredTable.where(query[0], query[1], query[2])
            }

            // Delete documents.
            const snapshot = await filteredTable.get()
            snapshot.forEach((doc) => doc.ref.delete())

            const arrLogQuery = _.flatten(where).map((i) => (_.isDate(i) ? dayjs(i).format("lll") : i))
            const logQuery = arrLogQuery.join(" ")
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
            const colname = `${collection}${this.collectionSuffix}`

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
         * @param replace Replace full object instead of merging.
         */
        set: async (id: string, data: any, replace?: boolean): Promise<void> => {
            const collection = "app-state"
            const colname = `${collection}${this.collectionSuffix}`
            const table = this.firestore.collection(colname)
            const doc = table.doc(id)

            // Save state data to the database.
            await doc.set(data, {merge: !replace})
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
            const colname = `${collection}${this.collectionSuffix}`
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
