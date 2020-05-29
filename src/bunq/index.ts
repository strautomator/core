// Strautomator Core: bunq

import {BunqPayment, BunqUser} from "./types"
import {BunqClient} from "./client"
import {UserData} from "../users/types"
import database from "../database"
import strava from "../strava"
import logger = require("anyhow")
import moment = require("moment")
const settings = require("setmeup").settings

/*
 * The bunq wrapper.
 */
export class Bunq {
    private constructor() {}
    private static _instance: Bunq
    static get Instance() {
        return this._instance || (this._instance = new this())
    }

    /**
     * Holds a list of active bunq clients.
     */
    clients: {[id: string]: BunqClient} = {}

    /**
     * Init the bunq wrapper.
     */
    init = async (): Promise<void> => {
        try {
            if (settings.bunq.disabled) {
                logger.warn("Bunq.init", "Disabled on settings, bunq integration won't work")
                return
            }

            if (!settings.bunq.api.clientId) {
                throw new Error("Missing the mandatory bunq.api.clientId setting")
            }
            if (!settings.bunq.api.clientSecret) {
                throw new Error("Missing the mandatory bunq.api.clientSecret setting")
            }
        } catch (ex) {
            logger.error("Bunq.init", ex)
            throw ex
        }

        // Force environment to uppercase.
        settings.bunq.api.environment = settings.bunq.api.environment.toUpperCase()
    }

    // REGISTRATION AND SETUP
    // --------------------------------------------------------------------------

    /**
     * Register a new bunq user.
     * @param user The user connecting to a bunq account.
     */
    register = async (user: UserData): Promise<BunqClient> => {
        try {
            const client = new BunqClient()
            await client.setup(user, true)

            this.clients[user.id] = client
            return client
        } catch (ex) {
            logger.error("Bunq.register", user, ex)
            throw ex
        }
    }

    /**
     * Update (or create) a bunq user on the database.
     * @param user The main user account.
     * @param bunqUser The bunq user to be saved.
     */
    saveBunqUser = async (user: UserData, bunqUser: BunqUser) => {
        try {
            await database.set("bunq", bunqUser, bunqUser.id.toString())
            logger.info("Bunq.saveBunqUser", `User ${user.id}`, `ID on bunq: ${bunqUser.id}`)
        } catch (ex) {
            logger.error("Bunq.saveBunqUser", `User ${user.id}`, `ID on bunq: ${bunqUser.id}`, ex)
        }
    }

    // PAYMENTS
    // --------------------------------------------------------------------------

    /**
     * Create a payment request for the specified user.
     * @param user The user.
     */
    payForActivities = async (user: UserData): Promise<BunqPayment> => {
        let payment: BunqPayment

        try {
            if (!user.bunqId) {
                const err = new Error(`User ${user.id} has no bunq ID assigned`) as any
                err.status = 404
                throw err
            }

            // First try registering the bunq client.
            const client = new BunqClient()
            await client.setup(user)
            this.clients[user.id] = client

            // User still has a valid token?
            if (!client.authenticated) {
                const err = new Error(`User ${user.id} needs to authenticate with bunq`) as any
                err.status = 401
                throw err
            }

            // Activity totals.
            let amount = 0
            let distance = 0
            let elevation = 0

            // Date ranges.
            let dateTo = moment().subtract(1, "days").hour(23).minute(59).second(59)
            let dateFrom

            if (client.bunqUser.interval == "weekly") {
                dateFrom = moment().subtract(7, "days").hour(0).minute(0).second(0)
            } else {
                dateFrom = moment().subtract(1, "months").hour(0).minute(0).second(0)
            }

            const query = {after: dateFrom.unix(), before: dateTo.unix()}
            const activities = await strava.activities.getActivities(user, query)

            // Iterate activities to calculate the total payment amount.
            for (let a of activities) {
                if (a.distance) {
                    distance += a.distance
                    amount += a.distance * client.bunqUser.pricePerKm
                }
                if (a.elevationGain) {
                    elevation += a.elevationGain
                    amount += (a.elevationGain / 1000) * client.bunqUser.pricePerClimbedKm
                }
            }

            // Get dates on the correct format.
            const dates = `from ${moment(dateFrom).format("L")} to ${moment(dateTo).format("L")}`

            payment = {
                description: `${distance}km and ${elevation}m on Strava, ${dates}`,
                amount: amount,
                date: new Date()
            }

            await client.makePayment(payment)
        } catch (ex) {
            logger.error("Bunq.payForActivities", user, ex)
            throw ex
        }

        // Destroy the client after everything has finished.
        if (this.clients[user.id]) {
            try {
                await this.clients[user.id].destroy()
                delete this.clients[user.id]
            } catch (ex) {
                logger.warn("Bunq.payForActivities", "Could not destroy the client session")
            }
        }

        return payment
    }
}

// Exports...
export default Bunq.Instance
