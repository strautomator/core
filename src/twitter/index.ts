// Strautomator Core: Twitter

import TwitterLite from "twitter-lite"
import logger = require("anyhow")
const settings = require("setmeup").settings

/**
 * Twitter wrapper.
 */
export class Twitter {
    private constructor() {}
    private static _instance: Twitter
    static get Instance() {
        return this._instance || (this._instance = new this())
    }

    /**
     * The Twitter client implementation.
     */
    client: TwitterLite

    /**
     * The Twitter handle name.
     */
    screenName: string

    // INIT
    // --------------------------------------------------------------------------

    /**
     * Init the Twitter wrapper.
     * @param quickStart If true, will not wait to get Twitter account details, default is false.
     */
    init = async (quickStart?: boolean): Promise<void> => {
        try {
            if (!settings.twitter.api.consumerKey) {
                throw new Error("Missing the twitter.api.consumerKey setting")
            }
            if (!settings.twitter.api.consumerSecret) {
                throw new Error("Missing the twitter.api.consumerSecret setting")
            }
            if (!settings.twitter.api.tokenKey) {
                throw new Error("Missing the twitter.api.tokenKey setting")
            }
            if (!settings.twitter.api.tokenSecret) {
                throw new Error("Missing the twitter.api.tokenSecret setting")
            }

            // Create client.
            this.client = new TwitterLite({
                consumer_key: settings.twitter.api.consumerKey,
                consumer_secret: settings.twitter.api.consumerSecret,
                access_token_key: settings.twitter.api.tokenKey,
                access_token_secret: settings.twitter.api.tokenSecret
            })

            // Get user screen name straight away, but only if quickStart was not set.
            if (!quickStart) {
                await this.getAccountDetails()
            } else {
                this.getAccountDetails()
            }
        } catch (ex) {
            logger.error("Twitter.init", ex)
        }
    }

    // POSTING
    // --------------------------------------------------------------------------

    /**
     * Get details for the logged account.
     */
    getAccountDetails = async (): Promise<any> => {
        try {
            const res = await this.client.get("account/verify_credentials")
            this.screenName = res.screen_name

            logger.info("Twitter.getAccountDetails", `Logged in as ${this.screenName}`)
            return res
        } catch (ex) {
            logger.error("Twitter.getAccountDetails", ex)
        }
    }

    /**
     * Post a message to Twitter.
     */
    post = async (status: string): Promise<void> => {
        try {
            await this.client.post("statuses/update", {
                status: status
            })

            logger.info("Twitter.post", status)
        } catch (ex) {
            logger.error("Twitter.post", status, ex)
        }
    }
}

// Exports...
export default Twitter.Instance
