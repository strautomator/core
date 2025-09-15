// Strautomator Core: Paddle Customers

import {Customer, CustomerNotification, EventEntity, ListCustomerQueryParameters} from "@paddle/paddle-node-sdk"
import {UserData} from "../users/types"
import api from "./api"
import users from "../users"
import _ from "lodash"
import logger from "anyhow"
import * as logHelper from "../loghelper"
const settings = require("setmeup").settings

/**
 * Paddle Customers.
 */
export class PaddleCustomers {
    private constructor() {}
    private static _instance: PaddleCustomers
    static get Instance() {
        return this._instance || (this._instance = new this())
    }

    /**
     * Update user data when the customer is updated on Paddle.
     * @param entity Customer notification.
     */
    onCustomerUpdated = async (entity: EventEntity): Promise<void> => {
        const data = entity.data as CustomerNotification

        try {
            const customData = entity.data as any

            // Make sure the user is valid.
            const userId = customData?.userId
            let user = await users.getByPaddleId(data.id)
            if (!user && userId) {
                user = await users.getById(userId)
            }
            if (!user) {
                throw new Error(`User ${userId} not found`)
            }

            // Update the user details, if needed.
            if (!user.email || user.paddleId != data.id) {
                await users.update({id: user.id, displayName: user.displayName, email: data.email, paddleId: data.id})
                logger.info("Paddle.onCustomerUpdated", logHelper.user(user), data.id, data.email)
            }
        } catch (ex) {
            logger.error("Paddle.onCustomerUpdated", logHelper.paddleEvent(entity), ex)
        }
    }

    // METHODS
    // --------------------------------------------------------------------------

    /**
     * Get customers from Paddle.
     * @param search Optional search string.
     */
    getCustomers = async (search?: string): Promise<Customer[]> => {
        const logSearch = search ? search : "All customers"

        try {
            const result: Customer[] = []

            const options: ListCustomerQueryParameters = {perPage: settings.paddle.api.pageSize}
            if (search) {
                options.search = search
            }
            let res = api.client.customers.list(options)
            let page = await res.next()
            result.push(...page)

            // Keep fetching while more pages are available.
            while (res.hasMore) {
                page = await res.next()
                result.push(...page)
            }

            logger.info("Paddle.getCustomers", logSearch, result.length > 1 ? `${result.length} customers` : result.length == 1 ? `Customer ${result[0].id}` : "No customers found")
            return result
        } catch (ex) {
            logger.error("Paddle.getCustomers", logSearch, ex)
            throw ex
        }
    }

    /**
     * Set the user ID custom data on the Paddle customer entity.
     * @param user The user data.
     */
    setCustomerUser = async (user: UserData): Promise<void> => {
        try {
            if (!user.paddleId) {
                throw new Error("User has no Paddle ID")
            }

            // Make sure we do not have duplicates.
            const existing = await users.getByPaddleId(user.paddleId)
            if (existing && existing.id != user.id) {
                throw new Error("Mismatching customer ID")
            }

            const name = user.profile.firstName && user.profile.lastName ? `${user.profile.firstName} ${user.profile.lastName}` : user.displayName
            await api.client.customers.update(user.paddleId, {name: name, customData: {userId: user.id}})
            logger.info("Paddle.setCustomerUser", logHelper.user(user), `Updated customer ${user.paddleId}`)
        } catch (ex) {
            logger.error("Paddle.setCustomerUser", logHelper.user(user), ex)
            throw ex
        }
    }
}

// Exports...
export default PaddleCustomers.Instance
