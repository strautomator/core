// Strautomator Core: bunq

import {BunqPayment, BunqUser} from "./types"
import {BunqClient} from "./client"
import {UserData} from "../users/types"
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
    clients: {[id: string]: BunqUser}

    /**
     * Init the bunq wrapper.
     */
    init = async (): Promise<void> => {
        if (!settings.bunq.api.key) {
            throw new Error("Missing the mandatory bunq.api.key setting")
        }
        if (!settings.bunq.api.clientId) {
            throw new Error("Missing the mandatory bunq.api.clientId setting")
        }
        if (!settings.bunq.api.clientSecret) {
            throw new Error("Missing the mandatory bunq.api.clientSecret setting")
        }

        // Force environment to uppercase.
        settings.bunq.api.environment = settings.bunq.api.environment.toUpperCase()
    }

    // MAIN METHODS
    // --------------------------------------------------------------------------

    register = async (user: UserData) => {
        try {
            const client = new BunqClient()
            await client.setup(user, true)
        } catch (ex) {
            logger.error("Bunq.register", user, ex)
        }
    }

    /**
     * Create a payment request for the specified user.
     * @param user The user.
     */
    payForActivities = async (user: UserData): Promise<BunqPayment> => {
        try {
            if (!user.bunqId) {
                const err = new Error(`User ${user.id} has no bunq ID assigned`) as any
                err.status = 404
                throw err
            }

            // First try registering the bunq client.
            const client = new BunqClient()
            await client.setup(user)

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
            const activities = await strava.activities.getActivities(user.stravaTokens, query)

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

            const payment: BunqPayment = {
                description: `${distance}km and ${elevation}m on Strava, ${dates}`,
                amount: amount,
                date: new Date()
            }

            await client.makePayment(payment)

            return null
        } catch (ex) {
            logger.error("Bunq.payForActivities", user, ex)
            throw ex
        }
    }
}

// Exports...
export default Bunq.Instance
