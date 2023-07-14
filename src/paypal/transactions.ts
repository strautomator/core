// Strautomator Core: PayPal Transactions

import {PayPalTransaction} from "./types"
import api from "./api"
import _ from "lodash"
import logger from "anyhow"
import dayjs from "../dayjs"

/**
 * PayPal Transactions API.
 */
export class PayPalTransactions {
    private constructor() {}
    private static _instance: PayPalTransactions
    static get Instance() {
        return this._instance || (this._instance = new this())
    }

    /**
     * Return list of transactions for the specified dates (max 31 days).
     * @param fromDate Filter by start date.
     * @param toDate Filter by end date.
     */
    getTransactions = async (fromDate: Date, toDate: Date): Promise<PayPalTransaction[]> => {
        const dFrom = dayjs(fromDate).startOf("day")
        const dTo = dayjs(toDate).endOf("day")
        const dateLog = `${dFrom.format("YYYY-MM-DD")} to ${dTo.format("YYYY-MM-DD")}`

        try {
            const options: any = {
                url: "reporting/transactions",
                params: {
                    page: 1,
                    page_size: 500,
                    start_date: fromDate.toISOString(),
                    end_date: toDate.toISOString(),
                    transaction_type: "T0002",
                    fields: "transaction_info,payer_info"
                }
            }

            const res = await api.makeRequest(options, true)

            // No transactions found? Stop here.
            if (!res.transaction_details || res.transaction_details.length == 0) {
                logger.info("PayPal.getTransactions", dateLog, "No transactions found")
                return []
            }

            const result: PayPalTransaction[] = res.transaction_details.map((t) => {
                return {
                    id: t.transaction_info.transaction_id,
                    amount: t.transaction_info.transaction_amount.value,
                    currency: t.transaction_info.transaction_amount.currency_code,
                    date: dayjs(t.transaction_info.transaction_updated_date).toDate(),
                    subscriptionId: t.transaction_info.paypal_reference_id,
                    email: t.payer_info.email_address
                }
            })

            return result
        } catch (ex) {
            logger.error("PayPal.getTransactions", dateLog, ex)
            throw ex
        }
    }
}

// Exports...
export default PayPalTransactions.Instance
