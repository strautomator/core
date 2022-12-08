// Strautomator Core: Beta

import {UserData} from "./users/types"
import {Database} from "./database"
import logger = require("anyhow")
const settings = require("setmeup").settings

/**
 * Reference to the production database.
 */
let databaseProd: Database

/**
 * Beta environment features.
 */
export class Beta {
    private constructor() {}
    private static _instance: Beta
    static get Instance(): Beta {
        return this._instance || (this._instance = new this())
    }

    // INIT
    // --------------------------------------------------------------------------

    /**
     * Init the Beta wrapper.
     */
    init = async (): Promise<void> => {
        try {
            if (!settings.beta.enabled) {
                logger.warn("Beta.init", "The app.beta flag is not set, will not init")
                return
            }

            logger.info("Beta.init", "Setting up the beta environment")

            databaseProd = Database.newInstance()
            await databaseProd.init({collectionSuffix: settings.beta.prodCollectionSuffix, description: "Beta connection to production"})
        } catch (ex) {
            logger.error("Beta.init", ex)
        }
    }

    /**
     * Get the corresponding production user by ID.
     * @param id The user's ID.
     */
    getProductionUser = async (id: string): Promise<UserData> => {
        try {
            const user: UserData = await databaseProd.get("users", id)

            if (user) {
                logger.info("Beta.getProductionUser", id, user.displayName, user.isPro ? "PRO" : "Free")
            } else {
                logger.warn("Beta.getProductionUser", id, "User not found")
            }

            return user && user.isPro ? user : null
        } catch (ex) {
            logger.error("Beta.getProductionUser", id, ex)
            throw ex
        }
    }
}

// Exports...
export default Beta.Instance
