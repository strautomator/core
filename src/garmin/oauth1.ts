// Strautomator Core: Garmin OAuth 1.0a
// Largely based on samples from Stack Overflow (gotta love the old OAuth1 spec).
// This will be slowly refactored as needed.

import {OAuth1Data} from "./types"
import {AxiosConfig} from "../axios"
import crypto from "crypto"
import jaul from "jaul"
import dayjs from "../dayjs"
const settings = require("setmeup").settings

export class GarminOAuth1 {
    private constructor() {}
    private static _instance: GarminOAuth1
    static get Instance() {
        return this._instance || (this._instance = new this())
    }

    /**
     * Get request authorization base data.
     */
    getData = (reqOptions: AxiosConfig, oauthToken?: string, tokenSecret?: string, oauthVerifier?: string): OAuth1Data => {
        const result: OAuth1Data = {
            oauth_timestamp: dayjs().unix(),
            oauth_nonce: jaul.data.uuid().replace(/\-/, ""),
            oauth_consumer_key: settings.garmin.api.clientId,
            oauth_version: "1.0",
            oauth_signature_method: "HMAC-SHA1"
        }

        if (oauthToken) {
            result.oauth_token = oauthToken
        }
        if (oauthVerifier) {
            result.oauth_verifier = oauthVerifier
        }

        result.oauth_signature = this.getSignature(reqOptions, result, tokenSecret)

        return result
    }

    /**
     * Get hash for the specified string.
     */
    getHash = (value: string, key: string) => {
        const hash = crypto.createHmac("sha1", key).update(value)
        return hash.digest("base64")
    }

    /**
     * Base string = method + base URL + OAuth parameters.
     */
    getBaseString = (reqOptions: AxiosConfig, data: OAuth1Data) => {
        const baseUrl = reqOptions.url.split("?")[0]
        const result = reqOptions.method.toUpperCase() + "&" + this.percentEncodeString(baseUrl) + "&" + this.percentEncodeString(this.getParameterString(reqOptions, data))
        return result
    }

    /**
     * Create an OAuth1 signature.
     */
    getSignature = (reqOptions: AxiosConfig, data: OAuth1Data, tokenSecret: string) => {
        return this.getHash(this.getBaseString(reqOptions, data), this.getSigningKey(tokenSecret))
    }

    /**
     * Process parameter string.
     */
    getParameterString = (reqOptions: AxiosConfig, oauthData: OAuth1Data) => {
        let base_string_data
        if (oauthData.oauth_body_hash) {
            base_string_data = this.getSortedObject(this.percentEncodeData(this.mergeObject(oauthData, this.deParamUrl(reqOptions.url))))
        } else {
            base_string_data = this.getSortedObject(this.percentEncodeData(this.mergeObject(oauthData, this.mergeObject(reqOptions.data, this.deParamUrl(reqOptions.url)))))
        }

        let data_str = ""

        for (let i = 0; i < base_string_data.length; i++) {
            let key = base_string_data[i].key
            let value = base_string_data[i].value

            if (value && Array.isArray(value)) {
                value.sort()

                let valString = ""
                value.forEach(
                    function (item, i) {
                        valString += key + "=" + item
                        if (i < value.length) {
                            valString += "&"
                        }
                    }.bind(this)
                )
                data_str += valString
            } else {
                data_str += key + "=" + value + "&"
            }
        }

        data_str = data_str.substring(0, data_str.length - 1)
        return data_str
    }

    /**
     * Get a signing key for the specified secret.
     */
    getSigningKey = (tokenSecret: string) => {
        tokenSecret = tokenSecret || ""
        return this.percentEncodeString(settings.garmin.api.clientSecret) + "&" + this.percentEncodeString(tokenSecret)
    }

    /**
     * Get data object from the specified string.
     */
    deParam = (value: string) => {
        let arr = value.split("&")
        let data = {}

        for (let i = 0; i < arr.length; i++) {
            let item = arr[i].split("=")

            item[1] = item[1] || ""

            if (data[item[0]]) {
                if (!Array.isArray(data[item[0]])) {
                    data[item[0]] = [data[item[0]]]
                }
                data[item[0]].push(decodeURIComponent(item[1]))
            } else {
                data[item[0]] = decodeURIComponent(item[1])
            }
        }

        return data
    }

    /**
     * Get data object from URL.
     */
    deParamUrl = (url: string) => {
        let tmp = url.split("?")

        if (tmp.length === 1) return {}

        return this.deParam(tmp[1])
    }

    /**
     * Return encoded percent value for the specified string.
     */
    percentEncodeString = (value: string) => {
        return encodeURIComponent(value).replace(/\!/g, "%21").replace(/\*/g, "%2A").replace(/\'/g, "%27").replace(/\(/g, "%28").replace(/\)/g, "%29")
    }

    /**
     * Encode percent values on the specified object.
     */
    percentEncodeData = (data: any) => {
        let result = {}

        for (let key in data) {
            let value = data[key]
            if (value && Array.isArray(value)) {
                let newValue = value.map((v) => this.percentEncodeString(v))
                value = newValue
            } else {
                value = this.percentEncodeString(value)
            }
            result[this.percentEncodeString(key)] = value
        }

        return result
    }

    /**
     * Get the OAuth1 header.
     */
    getHeader = (data: OAuth1Data): string => {
        const arrData = this.getSortedObject(data).filter((d) => d.key.indexOf("oauth_") === 0)
        const header = arrData.map((d) => this.percentEncodeString(d.key) + '="' + this.percentEncodeString(d.value) + '"')

        return `OAuth ${header.join(", ")}`
    }

    /**
     * Merge object.
     */
    mergeObject = (obj1: any, obj2: any) => {
        obj1 = obj1 || {}
        obj2 = obj2 || {}

        let merged_obj = obj1
        for (let key in obj2) {
            merged_obj[key] = obj2[key]
        }
        return merged_obj
    }

    /**
     * Sort object by key.
     */
    getSortedObject = (data: any) => {
        let keys = Object.keys(data)
        keys.sort()

        return keys.map((key) => {
            return {key: key, value: data[key]}
        })
    }
}

// Exports...
export default GarminOAuth1.Instance
