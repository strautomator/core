// Strautomator Core: Twitter

import {StravaActivity} from "../strava/types"
import {transformActivityFields} from "../strava/utils"
import {UserData} from "../users/types"
import * as messages from "./messages"
import eventManager from "../eventmanager"
import _ = require("lodash")
import TwitterLite from "twitter-lite"
import jaul = require("jaul")
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

            // Strava events.
            eventManager.on("Strava.processActivity", this.onStravaActivity)
        } catch (ex) {
            logger.error("Twitter.init", ex)
        }
    }

    /**
     * Post interesting processed activities to Twitter.
     * @param user The activity owner.
     * @param activity The activity data.
     */
    onStravaActivity = async (user: UserData, activity: StravaActivity): Promise<void> => {
        try {
            if (!user.preferences || !user.preferences.twitterShare) return

            // Parameters to decide if the ride was "impressive" or not.
            const imperial: boolean = user.profile.units == "imperial"
            const rideDistance: number = imperial ? 130 : 200
            const rideSpeed: number = imperial ? 26 : 42
            const runDistance: number = imperial ? 26 : 42
            let messageTemplates: string[] = null

            // Rides.
            if (activity.type == "Ride") {
                if (activity.distance > rideDistance) {
                    messageTemplates = messages.RideLongDistance
                } else if (activity.speedAvg > rideSpeed) {
                    messageTemplates = messages.RideFast
                }
            }

            // Runs.
            else if (activity.type == "Run") {
                if (activity.distance > runDistance) {
                    messageTemplates = messages.RunLongDistance
                }
            }

            // Nothing interesting to post?
            if (!messageTemplates) {
                logger.debug("Twitter.onStravaActivity", `User ${user.id} ${user.displayName}`, `Activity ${activity.id}`, "Not interesting, won't post")
                return
            }

            // Only a few percent of interesting rides should be actually posted to Twitter.
            if (Math.random() <= settings.twitter.activityThreshold) {
                await this.postActivity(user, activity, _.sample(messageTemplates))
            } else {
                logger.info("Twitter.onStravaActivity", `User ${user.id} ${user.displayName}`, `Activity ${activity.id}`, "Did not win in the lottery :-(")
            }
        } catch (ex) {
            logger.error("Twitter.onStravaActivity", `User ${user.id} ${user.displayName}`, `Activity ${activity.id}`, ex)
        }
    }

    // GET TWITTER INFO
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

    // POSTING TO TWITTER
    // --------------------------------------------------------------------------

    /**
     * Post a message to Twitter.
     * @param status Status to be posted to Twitter.
     */
    postStatus = async (status: string): Promise<void> => {
        try {
            await this.client.post("statuses/update", {status: status})
            logger.info("Twitter.postStatus", status)
        } catch (ex) {
            logger.error("Twitter.postStatus", status, ex)
        }
    }

    /**
     * Shortcut to postStatus() with the activity details as the status message.
     * @param user The owner of the activity.
     * @param activity The Strava activity.
     * @param message Template message to be used.
     */
    postActivity = async (user: UserData, activity: StravaActivity, message: string): Promise<void> => {
        try {
            transformActivityFields(user, activity)

            message = jaul.data.replaceTags(message, {user: user.displayName})
            message = jaul.data.replaceTags(message, activity)

            await this.postStatus(`${message} https://strava.com/activities/${activity.id}`)
        } catch (ex) {
            logger.error("Twitter.postActivity", `User ${user.id} ${user.displayName}`, `Activity ${activity.id}`, ex)
        }
    }
}

// Exports...
export default Twitter.Instance
