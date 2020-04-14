import { DocumentReference } from "@google-cloud/firestore";
/**
 * Database wrapper.
 */
export declare class Database {
    private constructor();
    private static _instance;
    static get Instance(): Database;
    /**
     * Firestore client.
     */
    private firestore;
    /**
     * Init the Database wrapper.
     */
    init: () => Promise<void>;
    /**
     * Returns a new (unsaved) document for the specified collection.
     * @param collection Name of the collection.
     * @param id Optional document ID.
     */
    doc: (collection: string, id?: string) => DocumentReference<FirebaseFirestore.DocumentData>;
    /**
     * Update or insert a new document on the specified database collection. Returns epoch timestamp.
     * @param collection Name of the collection.
     * @param data Document data.
     * @param id Optional unique ID, will be auto generated if not present.
     */
    set: (collection: string, data: any, id?: string) => Promise<number>;
    /**
     * Similar to set, but accepts a document directly and auto set to merge data. Returns epoch timestamp.
     * @param collection Name of the collection.
     * @param data Data to merge to the document.
     * @param doc The document reference, optional, if not set will fetch from database based on ID.
     */
    merge: (collection: string, data: any, doc?: DocumentReference<FirebaseFirestore.DocumentData>) => Promise<number>;
    /**
     * Get a single document from the specified database collection.
     * @param collection Name of the collection.
     * @param id ID of the desired document.
     * @param skipCache If set to true, will not lookup on in-memory cache.
     */
    get: (collection: string, id: string, skipCache?: boolean) => Promise<any>;
    /**
     * Search for documents on the specified database collection.
     * @param collection Name of the collection.
     * @param queryList List of query in the format [property, operator, value].
     * @param orderBy Order by field, optional.
     */
    search: (collection: string, queryList?: any[], orderBy?: string) => Promise<any[]>;
    /**
     * Increment a field on the specified document on the database.
     * @param collection Name of the collection.
     * @param id Document ID.
     * @param field Name of the field that should be incremented.
     * @param value Optional increment valud, default is 1, can also be negative.
     */
    increment: (collection: string, id: string, field: string, value?: number) => Promise<void>;
    /**
     * Transform result from the database to standard JS formats.
     * @data The data to be parsed and (if necessary) transformed.
     */
    private transformData;
}
declare const _default: Database;
export default _default;
