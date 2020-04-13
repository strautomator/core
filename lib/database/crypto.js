"use strict";
// Strautomator Core: Database Crypto
Object.defineProperty(exports, "__esModule", { value: true });
const _ = require("lodash");
const crypto = require("crypto");
const logger = require("anyhow");
const settings = require("setmeup").settings;
/**
 * Process and mutates the passed data with relevant fields getting encrypted.
 * @param data Data to be encrypted.
 * @param encrypt Should be true to encrypt, or false to decrypt.
 */
function cryptoProcess(data, encrypt) {
    let key;
    let value;
    if (_.isArray(data)) {
        for (value of data) {
            if (_.isObject(value)) {
                cryptoProcess(value, encrypt);
            }
        }
    }
    else {
        for ([key, value] of Object.entries(data)) {
            if (_.isString(value) && settings.database.crypto.fields.indexOf(key) >= 0) {
                if (encrypt) {
                    data[key] = encryptData(value);
                }
                else {
                    data[key] = decryptData(value);
                }
            }
            else if (_.isObject(value)) {
                cryptoProcess(value, encrypt);
            }
        }
    }
}
exports.cryptoProcess = cryptoProcess;
/**
 * Encrypt the passed value. Encrypted values are prefixed with "enc::".
 * @param value Value to be encrypted before saving.
 */
function encryptData(value) {
    if (value === null) {
        return null;
    }
    const key = Buffer.from(settings.database.crypto.key);
    const iv = Buffer.from(settings.database.crypto.iv);
    const cipher = crypto.createCipheriv(settings.database.crypto.algorithm, key, iv);
    let encrypted = cipher.update(value);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return `enc::${encrypted.toString("hex")}`;
}
exports.encryptData = encryptData;
/**
 * Decrypt the passed value. Encrypted values must be prefixed with "enc::".
 * @param value Value to be decrypted after document fetching from the database.
 */
function decryptData(value) {
    try {
        if (value === null) {
            return null;
        }
        value = value.toString();
        if (value.substring(0, 5) != "enc::") {
            logger.warn("Database.decrypt", value, "Value does not seem to be encrypted, will return itself");
            return value;
        }
        const key = Buffer.from(settings.database.crypto.key);
        const iv = Buffer.from(settings.database.crypto.iv);
        const text = Buffer.from(value.substring(5), "hex");
        const decipher = crypto.createDecipheriv(settings.database.crypto.algorithm, key, iv);
        let decrypted = decipher.update(text);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString();
    }
    catch (ex) {
        logger.error("Database.decrypt", value, ex);
    }
}
exports.decryptData = decryptData;
