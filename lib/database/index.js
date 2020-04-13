"use strict";
// Strautomator Core: Database
Object.defineProperty(exports, "__esModule", { value: true });
const firestore_1 = require("@google-cloud/firestore");
const crypto_1 = require("./crypto");
const _ = require("lodash");
const cache = require("bitecache");
const logger = require("anyhow");
const settings = require("setmeup").settings;
/**
 * Database wrapper.
 */
class Database {
    constructor() {
        // INIT
        // --------------------------------------------------------------------------
        /**
         * Init the database wrapper.
         */
        this.init = async () => {
            try {
                if (!settings.gcp.projectId) {
                    throw new Error("Missing the mandatory gcp.projectId setting");
                }
                if (!settings.database.crypto.key) {
                    throw new Error("Missing the mandatory database.crypto.key setting");
                }
                const options = { projectId: settings.gcp.projectId };
                if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
                    options.keyFilename = process.env.GOOGLE_APPLICATION_CREDENTIALS;
                }
                this.firestore = new firestore_1.Firestore(options);
                const prefix = settings.database.collectionPrefix;
                const logPrefix = prefix ? `Collections prefixed with "${prefix}"` : "No collections prefix";
                cache.setup("database", settings.database.cacheDuration);
                logger.info("Database.init", logPrefix);
            }
            catch (ex) {
                logger.error("Database.init", ex);
                throw ex;
            }
        };
        // METHODS
        // --------------------------------------------------------------------------
        /**
         * Returns a new (unsaved) document for the specified collection.
         * @param collection Name of the collection.
         * @param id Optional document ID.
         */
        this.doc = (collection, id) => {
            const colname = `${settings.database.collectionPrefix}${collection}`;
            return id ? this.firestore.collection(colname).doc(id) : this.firestore.collection(colname).doc();
        };
        /**
         * Update or insert a new document on the specified database collection. Returns epoch timestamp.
         * @param collection Name of the collection.
         * @param data Document data.
         * @param id Optional unique ID, will be auto generated if not present.
         */
        this.set = async (collection, data, id) => {
            const colname = `${settings.database.collectionPrefix}${collection}`;
            const table = this.firestore.collection(colname);
            const doc = table.doc(id);
            // Encrypt relevant data before storing on the database.
            const encryptedData = _.cloneDeep(data);
            crypto_1.cryptoProcess(encryptedData, true);
            const result = await doc.set(encryptedData);
            // Add result to cache if an ID was passed.
            if (id) {
                cache.set("database", `${collection}-${id}`, data);
            }
            return result.writeTime.seconds;
        };
        /**
         * Similar to set, but accepts a document directly and auto set to merge data. Returns epoch timestamp.
         * @param collection Name of the collection.
         * @param data Data to merge to the document.
         * @param doc The document reference, optional, if not set will fetch from database based on ID.
         */
        this.merge = async (collection, data, doc) => {
            const encryptedData = _.cloneDeep(data);
            crypto_1.cryptoProcess(encryptedData, true);
            if (!doc) {
                const colname = `${settings.database.collectionPrefix}${collection}`;
                const table = this.firestore.collection(colname);
                doc = table.doc(data.id);
            }
            const result = await doc.set(encryptedData, { merge: true });
            // Also merge result on the cache.
            cache.merge("database", `${collection}-${doc.id}`, data);
            return result.writeTime.seconds;
        };
        /**
         * Get a single document from the specified database collection.
         * @param collection Name of the collection.
         * @param id ID of the desired document.
         * @param skipCache If set to true, will not lookup on in-memory cache.
         */
        this.get = async (collection, id, skipCache) => {
            const colname = `${settings.database.collectionPrefix}${collection}`;
            // First check if document is cached.
            if (!skipCache && settings.database.cacheDuration) {
                const fromCache = cache.get("database", `${collection}-${id}`);
                if (fromCache) {
                    return fromCache;
                }
            }
            // Continue here with a regular database fetch.
            const table = this.firestore.collection(colname);
            const doc = await table.doc(id).get();
            if (doc.exists) {
                const result = doc.data();
                // Decrypt relevant fields from the database result.
                crypto_1.cryptoProcess(result, false);
                this.transformData(result);
                result.id = doc.id;
                // Add result to cache, only if enabled.
                if (settings.database.cacheDuration) {
                    cache.set("database", `${collection}-${id}`, result);
                }
                return result;
            }
            return null;
        };
        /**
         * Search for documents on the specified database collection.
         * @param collection Name of the collection.
         * @param queryList List of query in the format [property, operator, value].
         * @param orderBy Order by field, optional.
         */
        this.search = async (collection, queryList, orderBy) => {
            const colname = `${settings.database.collectionPrefix}${collection}`;
            let filteredTable = this.firestore.collection(colname);
            // Make sure query list is an array by itself.
            if (queryList && _.isString(queryList[0])) {
                queryList = [queryList];
            }
            // Iterate and build queries, if any was passed.
            if (queryList) {
                for (let query of queryList) {
                    filteredTable = filteredTable.where(query[0], query[1], query[2]);
                }
            }
            // Order by field?
            if (orderBy) {
                filteredTable = filteredTable.orderBy(orderBy);
            }
            const snapshot = await filteredTable.get();
            const results = [];
            if (!snapshot.empty) {
                snapshot.forEach((r) => {
                    const result = r.data();
                    crypto_1.cryptoProcess(result, false);
                    this.transformData(result);
                    result.id = r.id;
                    results.push(result);
                });
            }
            return results;
        };
        /**
         * Increment a field on the specified document on the database.
         * @param collection Name of the collection.
         * @param id Document ID.
         * @param field Name of the field that should be incremented.
         * @param value Optional increment valud, default is 1, can also be negative.
         */
        this.increment = async (collection, id, field, value) => {
            const colname = `${settings.database.collectionPrefix}${collection}`;
            const table = this.firestore.collection(colname);
            const doc = table.doc(id);
            const data = {};
            // Default increment is 1.
            if (!value) {
                value = 1;
            }
            // Increment field.
            data[field] = firestore_1.FieldValue;
            await doc.update({ activityCount: firestore_1.FieldValue.increment(value) });
        };
        // HELPERS
        // --------------------------------------------------------------------------
        /**
         * Transform result from the database to standard JS formats.
         * @data The data to be parsed and (if necessary) transformed.
         */
        this.transformData = (data) => {
            if (!data)
                return;
            let key;
            let value;
            if (_.isArray(data)) {
                for (value of data) {
                    if (_.isObject(value)) {
                        this.transformData(value);
                    }
                }
            }
            else {
                for ([key, value] of Object.entries(data)) {
                    if (_.isObject(value) && value._seconds > 0) {
                        data[key] = new Date(value._seconds * 1000);
                    }
                }
            }
        };
    }
    static get Instance() {
        return this._instance || (this._instance = new this());
    }
}
exports.Database = Database;
// Exports...
exports.default = Database.Instance;
