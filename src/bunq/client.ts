// Strautomator Core: bunq client

import {BunqPayment, BunqUser} from "./types"
import {UserData} from "../users/types"
import BunqJSClient from "@bunq-community/bunq-js-client"
import database from "../database"
import _ = require("lodash")
import logger = require("anyhow")
import crypto = require("crypto")
import moment = require("moment")
const settings = require("setmeup").settings

// Encryption options.
const IV_LENGTH = 16
const NONCE_LENGTH = 5

/*
 * Wrapper to a bunq client instance.
 */
export class BunqClient {
    /**
     * The internal bunq client.
     */
    client: BunqJSClient

    /**
     * User ID (from main user / Strava profile).
     */
    userId: string

    /**
     * Details of the bunq account.
     */
    bunqUser: BunqUser

    /**
     * Helper to return the user summary (mostly used on logging).
     */
    get userSummary() {
        if (this.bunqUser && this.bunqUser.email) {
            return `User ${this.userId} - ${this.bunqUser.email}`
        }
        return `User ${this.userId}`
    }

    /**
     * Register a client connection with bunq.
     * @param user Owner of the bunq account.
     */
    setup = async (userData: UserData, newRegistration?: boolean): Promise<void> => {
        logger.debug("BunqClient.setup", userData, newRegistration)
        this.userId = userData.id

        try {
            // Is it a new registration? If so, create a new random encryption key.
            if (newRegistration) {
                let key = crypto.randomBytes(16).toString("hex")
                if (key.length < 32) key = `A${key}`

                this.bunqUser = {
                    cryptoKey: key,
                    dateAuth: new Date(),
                    sessionStore: {}
                } as any
            } else {
                let bunqUser: BunqUser = await database.get("bunq", userData.bunqId)

                if (!bunqUser) {
                    throw new Error(`User ${userData.id} has not configured a bunq account`)
                }

                // Decrypt session store from database using the user key.
                const message = Buffer.from(bunqUser.sessionStore, "base64")
                const iv = Buffer.alloc(IV_LENGTH)
                message.copy(iv, 0, 0, NONCE_LENGTH)
                const encryptedText = message.slice(NONCE_LENGTH)
                const decipher = crypto.createDecipheriv(settings.database.crypto.algorithm, this.bunqUser.cryptoKey, iv)
                let decrypted = decipher.update(encryptedText)
                bunqUser.sessionStore = Buffer.concat([decrypted, decipher.final()]).toString()

                // The store is saved as an encrypted string on the database, so we need to parse it back to JSON here.
                bunqUser.sessionStore = JSON.parse(bunqUser.sessionStore)

                this.bunqUser = bunqUser
            }
        } catch (ex) {
            logger.error("BunqClient.setup", `User ${userData.id}`, ex)
            throw ex
        }

        try {
            // Custom store handler.
            const customStore = {
                get: (key: string) => {
                    return this.bunqUser.sessionStore[key]
                },
                set: (key: string, value: any) => {
                    this.bunqUser.sessionStore[key] = value
                    return value
                },
                remove: (key: string): void => {
                    delete this.bunqUser.sessionStore[key]
                }
            }

            // Custom adapter wrapping the anyhow logger.
            const customLogger = {
                log: (obj) => {
                    logger.debug("BunqJSClient", this.userSummary, obj)
                },
                trace: (obj) => {
                    logger.debug("BunqJSClient", this.userSummary, obj)
                },
                debug: (obj) => {
                    logger.debug("BunqJSClient", this.userSummary, obj)
                },
                info: (obj) => {
                    logger.info("BunqJSClient", this.userSummary, obj)
                },
                warn: (obj) => {
                    logger.warn("BunqJSClient", this.userSummary, obj)
                },
                error: (obj) => {
                    logger.error("BunqJSClient", this.userSummary, obj)
                }
            }

            // Create the underlying JS client.
            this.client = new BunqJSClient(customStore, customLogger)
            this.client.setKeepAlive(false)
        } catch (ex) {
            logger.error("BunqClient.setup", this.userSummary, "Constructor error", ex)
            throw ex
        }

        // Setup client.
        try {
            const apiKey = settings.bunq.api.key || false
            await this.client.run(apiKey, [], settings.bunq.api.environment, this.bunqUser.cryptoKey)
            await this.client.install()
        } catch (ex) {
            logger.error("BunqClient.setup", this.userSummary, "Install error", ex)
            throw ex
        }

        // Register device and session.
        try {
            await this.client.registerDevice(settings.app.title)
            await this.client.registerSession()
        } catch (ex) {
            logger.error("BunqClient.setup", this.userSummary, "Session registration error", ex)
            throw ex
        }
    }

    /**
     * Remove all information from memory, save session state and destroy the API session.
     */
    destroy = async (): Promise<void> => {
        try {
            let sessionStore = JSON.stringify(this.bunqUser.sessionStore, null, 0)

            // Encrypt session store data before saving to the database.
            const nonce = crypto.randomBytes(NONCE_LENGTH)
            const iv = Buffer.alloc(IV_LENGTH)
            nonce.copy(iv)
            const cipher = crypto.createCipheriv(settings.database.crypto.algorithm, this.bunqUser.cryptoKey, iv)
            const encrypted = cipher.update(sessionStore)
            sessionStore = Buffer.concat([nonce, encrypted, cipher.final()]).toString("base64")

            // Update encrypted session store on user and save to the database.
            this.bunqUser.sessionStore = sessionStore
            await database.set("bunq", this.bunqUser, this.bunqUser.id.toString())

            this.client.destroyApiSession(false)
        } catch (ex) {
            logger.error("BunqClient.destroy", this.userSummary, ex)
        }
    }

    // AUTH
    // --------------------------------------------------------------------------

    /**
     * The authentication URL used to start the OAuth2 flow with bunq.
     */
    get authUrl(): string {
        const apiUrl = settings.api.url || `${settings.app.url}api/`
        const redirectUrl = apiUrl + "bunq/auth/callback"
        const sandbox = settings.bunq.api.environment == "SANDBOX"
        return this.client.formatOAuthAuthorizationRequestUrl(settings.bunq.api.clientId, redirectUrl, false, sandbox)
    }

    /**
     * User / client has a valid token to connect to bunq?
     */
    get authenticated(): boolean {
        return this.bunqUser.dateAuth > new Date()
    }

    /**
     * Get the OAuth2 access token based on the provided authorization code.
     * This method will return null when it fails to get the token.
     * @param code The authorization code provided via the auth callback URL.
     */
    getOAuthToken = async (code: string) => {
        const redirect = settings.app.url + "bunq/auth/callback"

        try {
            const sandbox = settings.bunq.api.environment == "SANDBOX"
            const token = await this.client.exchangeOAuthToken(settings.bunq.api.clientId, settings.bunq.api.clientSecret, redirect, code, false, sandbox, "authorization_code")

            if (!token) {
                throw new Error("Invalid access token")
            }

            logger.info("BunqClient.getOAuthToken", this.userSummary, "Got a new access token")
            return true
        } catch (ex) {
            logger.error("BunqClient.getOAuthToken", this.userSummary, ex)
            return false
        }
    }

    // MAIN METHODS
    // --------------------------------------------------------------------------

    /**
     * Get the user account details.
     * @param user Bunq user details.
     */
    getUserDetails = async (): Promise<void> => {
        try {
            const users = await this.client.getUsers(true)
            const userDetails = users[Object.keys(users)[0]]

            logger.info("BunqClient.getUserDetails", this.userSummary, userDetails.public_nick_name)

            this.bunqUser.id = userDetails.id
            this.bunqUser.email = _.find(userDetails.alias, {type: "EMAIL"}).value
        } catch (ex) {
            logger.error("BunqClient.getUserDetails", this.userSummary, ex)
            throw ex
        }
    }

    /**
     * Get all the relevant accounts for the user.
     * @param user Bunq user details.
     */
    getAccounts = async () => {
        logger.debug("BunqClient.getAccounts")

        try {
            const accounts = await this.client.api.monetaryAccount.list(this.bunqUser.id)

            logger.info("BunqClient.getAccounts", this.userSummary, `Got ${accounts.length} accounts`)
            return accounts
        } catch (ex) {
            logger.error("BunqClient.getAccounts", this.userSummary, ex)
            throw ex
        }
    }

    /**
     * Get the current account balance for the specified alias.
     * @param user Bunq user details.
     * @param alias The email, phone or IBAN of the account.
     */
    getAccountBalance = async (alias: string | number): Promise<number> => {
        logger.debug("BunqClient.getAccountBalance", alias)

        try {
            const accounts = await this.getAccounts()
            const acc = _.find(accounts, (a) => {
                return _.find(a.alias, {value: alias}) != null
            })

            if (!acc) {
                throw new Error(`Account ${alias} not found`)
            }

            return parseFloat(acc.balance.value)
        } catch (ex) {
            logger.error("BunqClient.getAccountBalance", alias, ex)
            throw ex
        }
    }

    /**
     * Make a payment to another account.
     * @param user Bunq user details.
     * @param payment The payment options.
     */
    makePayment = async (payment: BunqPayment): Promise<void> => {
        logger.debug("BunqClient.makePayment", payment)

        const alias: any = {value: this.bunqUser.targetAccount}
        let accounts, accountId, niceAmount, paymentId

        try {
            accounts = await this.getAccounts()

            niceAmount = payment.amount.toFixed(2)

            // Payment description is mandatory.
            if (!payment.description || payment.description == " ") {
                throw new Error("A payment description is mandatory.")
            }

            // Basic payment validation.
            if (payment.amount <= 0) {
                throw new Error("Payments must have an amount greater than 0.")
            }

            const acc = _.find(accounts, (a) => {
                return _.find(a.alias, {value: this.bunqUser.sourceAccount}) != null
            })

            // Account not found?
            if (acc == null) {
                throw new Error(`Account ${this.bunqUser.sourceAccount} not found`)
            }

            accountId = acc.id

            const toAliasString = this.bunqUser.targetAccount

            // Set alias to email or phone depending on its value.
            if (toAliasString.indexOf("@") > 0) {
                alias.type = "EMAIL"
            } else {
                alias.type = "PHONE_NUMBER"
            }
        } catch (ex) {
            throw ex
        }

        try {
            const now = moment()
            const logAccount = _.find(accounts, {id: accountId}).description
            const logFromTo = `${niceAmount} from ${logAccount} to ${this.bunqUser.targetAccount}`

            logger.debug("BunqClient.makePayment", "Will trigger now", `From account ${accountId}`, payment)

            // Check if payments are disable. If so, log instead, otherwise proceed.
            if (settings.bunq.disablePayments) {
                paymentId = 0
                logger.warn("BunqClient.makePayment", "Payments are DISABLED on settings", logFromTo, payment.description)
            } else {
                paymentId = await this.client.api.draftPayment.post(
                    this.bunqUser.id,
                    accountId,
                    payment.description,
                    {
                        value: niceAmount,
                        currency: settings.bunq.currency
                    },
                    alias
                )

                // Make sure we get the correct payment ID from response.
                // TODO! Remove and leave only correct condition after bunq API is on stable v1.
                if (_.isArray(paymentId)) {
                    paymentId = paymentId[0]
                }
                if (paymentId.Id) {
                    paymentId = paymentId.Id
                }
                if (paymentId.id) {
                    paymentId = paymentId.id
                }

                // Save payment record to database, which is a copy of
                // the payment options but with a date added.
                payment.id = paymentId
                payment.date = now.toDate()

                logger.info("BunqClient.makePayment", `ID ${paymentId}`, logFromTo, payment.description)
            }
        } catch (ex) {
            logger.error("BunqClient.makePayment", this.userSummary, paymentId, ex)
            throw ex
        }

        // Payment was successful? Add a Strautomator note to it.
        if (paymentId) {
            try {
                const note = `Added by ${settings.app.title}`
                await this.client.api.noteText.post("draft-payment", this.bunqUser.id, accountId, paymentId, note)
                logger.info("BunqClient.addPaymentNote", this.userSummary, paymentId, note)
            } catch (ex) {
                logger.error("BunqClient.addPaymentNote", this.userSummary, paymentId, ex)
            }
        }
    }
}
