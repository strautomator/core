// Strautomator Core: Database Crypto

import _ from "lodash"
import crypto from "crypto"
import logger from "anyhow"
const settings = require("setmeup").settings

/**
 * Process and mutates the passed data with relevant fields getting encrypted.
 * @param data Data to be encrypted.
 * @param encrypt Should be true to encrypt, or false to decrypt.
 */
export function cryptoProcess(data: any, encrypt: boolean): void {
    let key: string
    let value: any

    if (_.isArray(data)) {
        for (value of data) {
            if (_.isObject(value)) {
                cryptoProcess(value, encrypt)
            }
        }
    } else {
        for ([key, value] of Object.entries(data)) {
            if (_.isString(value) && settings.database.crypto.fields.includes(key)) {
                if (encrypt) {
                    data[key] = encryptData(value)
                } else {
                    data[key] = decryptData(key, value)
                }
            } else if (_.isObject(value)) {
                cryptoProcess(value, encrypt)
            }
        }
    }
}

/**
 * Encrypt the passed value. Encrypted values are prefixed with "enc::".
 * @param value Value to be encrypted before saving.
 */
export function encryptData(value: string): string {
    if (value === null) {
        return null
    }

    const key = Buffer.from(settings.database.crypto.key)
    const iv = Buffer.from(settings.database.crypto.iv)
    const cipher = crypto.createCipheriv(settings.database.crypto.algorithm, key, iv)

    let encrypted = cipher.update(value)
    encrypted = Buffer.concat([encrypted, cipher.final()])

    return `enc::${encrypted.toString("hex")}`
}

/**
 * Decrypt the passed value. Encrypted values must be prefixed with "enc::".
 * @param prop The property name of what's being decrypted.
 * @param value Value to be decrypted after document fetching from the database.
 */
export function decryptData(prop: string, value: string): string {
    try {
        if (value === null) {
            return null
        }

        value = value.toString()

        if (value.substring(0, 5) != "enc::") {
            logger.debug("Database.decrypt", prop, value, "Value does not seem to be encrypted, will return itself")
            return value
        }

        const key = Buffer.from(settings.database.crypto.key)
        const iv = Buffer.from(settings.database.crypto.iv)
        const text = Buffer.from(value.substring(5), "hex")
        const decipher = crypto.createDecipheriv(settings.database.crypto.algorithm, key, iv)

        let decrypted = decipher.update(text)
        decrypted = Buffer.concat([decrypted, decipher.final()])

        return decrypted.toString()
    } catch (ex) {
        logger.error("Database.decrypt", prop, value, ex)
    }
}
