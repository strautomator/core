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
     * The Twitter handle name (set on init).
     */
    screenName: string

    // INIT
    // --------------------------------------------------------------------------

    /**
     * Init the Twitter wrapper.
     */
    init = async (): Promise<void> => {
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

            // Get user screen name.
            const res = await this.client.get("account/verify_credentials")
            this.screenName = res.screen_name

            logger.info("Twitter.init", `Logged in as ${this.screenName}`)
        } catch (ex) {
            logger.error("Twitter.init", ex)
        }
    }

    // POSTING
    // --------------------------------------------------------------------------

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
            logger.error("Twitter.post", ex)
        }
    }
}

// Exports...
export default Twitter.Instance
