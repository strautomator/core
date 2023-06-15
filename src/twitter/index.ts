// Strautomator Core: Twitter

import {StravaActivity} from "../strava/types"
import {transformActivityFields} from "../strava/utils"
import {UserData} from "../users/types"
import {TwitterApi} from "twitter-api-v2"
import * as messages from "./messages"
import database from "../database"
import eventManager from "../eventmanager"
import _ from "lodash"
import jaul = require("jaul")
import logger = require("anyhow")
import * as logHelper from "../loghelper"
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
    client: TwitterApi

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
            if (!settings.twitter.api.appKey) {
                throw new Error("Missing the twitter.api.appKey setting")
            }
            if (!settings.twitter.api.appSecret) {
                throw new Error("Missing the twitter.api.appSecret setting")
            }
            if (!settings.twitter.api.accessToken) {
                throw new Error("Missing the twitter.api.accessToken setting")
            }
            if (!settings.twitter.api.accessSecret) {
                throw new Error("Missing the twitter.api.accessSecret setting")
            }

            // Create client.
            this.client = new TwitterApi({
                appKey: settings.twitter.api.appKey,
                appSecret: settings.twitter.api.appSecret,
                accessToken: settings.twitter.api.accessToken,
                accessSecret: settings.twitter.api.accessSecret
            })

            // Load data from database cache first.
            const fromCache = await database.appState.get("twitter")
            if (fromCache) {
                this.screenName = fromCache.screenName
                logger.info("Twitter.init", `Screen name from cache: ${this.screenName}`)
            }

            // Get user screen name straight away, but only if quickStart was not set.
            if (!quickStart) {
                await this.client.appLogin()
                await this.getAccountDetails()
            } else if (!this.screenName) {
                await this.client.appLogin()
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
            if (!user.preferences.twitterShare || user.preferences.privacyMode || user.displayName == "anonymous") {
                return
            }

            // Avoid posting activities that might have been manually created or have bogus data.
            if (!activity.hasCadence && !activity.hasPower && (!activity.hrAvg || activity.hrAvg < 100)) {
                return
            }

            // Parameters to decide if the ride was "impressive" or not.
            const imperial: boolean = user.profile.units == "imperial"
            const rideDistance: number = imperial ? 125 : 200
            const rideSpeed: number = imperial ? 25 : 40
            const runDistance: number = imperial ? 26 : 42
            const runSpeed: number = imperial ? 12 : 20
            let messageTemplates: string[] = null

            // Rides.
            if (activity.sportType.includes("Ride")) {
                if (activity.distance >= rideDistance) {
                    messageTemplates = messages.RideLongDistance
                } else if (activity.speedAvg >= rideSpeed && activity.distance >= 40) {
                    messageTemplates = messages.RideFast
                }
            }

            // Runs.
            else if (activity.sportType.includes("Run") || activity.sportType == "Hike") {
                if (activity.distance >= runDistance) {
                    messageTemplates = messages.RunLongDistance
                } else if (activity.speedAvg >= runSpeed && activity.distance >= 5) {
                    messageTemplates = messages.RunFast
                }
            }

            // Nothing interesting to post?
            if (!messageTemplates) {
                logger.debug("Twitter.onStravaActivity", logHelper.user(user), logHelper.activity(activity), "Not interesting, won't post")
                return
            }

            // Only a few percent of interesting rides should be actually posted to Twitter.
            const lottery = Math.random()
            if (lottery <= settings.twitter.activityThreshold) {
                await this.postActivity(user, activity, _.sample(messageTemplates))
            } else {
                logger.info("Twitter.onStravaActivity", logHelper.user(user), logHelper.activity(activity), `Did not win in the lottery (${lottery.toFixed(0.1)})`)
            }
        } catch (ex) {
            logger.error("Twitter.onStravaActivity", logHelper.user(user), logHelper.activity(activity), ex)
        }
    }

    // GET TWITTER INFO
    // --------------------------------------------------------------------------

    /**
     * Get details for the logged account.
     */
    getAccountDetails = async (): Promise<any> => {
        try {
            const res = await this.client.readOnly.v2.me()

            // Screen name updated? Save to database cache.
            if (this.screenName != res.data.username) {
                this.screenName = res.data.username
                await database.appState.set("twitter", {screenName: res.data.username})
            }

            logger.info("Twitter.getAccountDetails", `Logged as ${this.screenName}`)
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
            await this.client.readWrite.v2.tweet(status)
            logger.info("Twitter.postStatus", status)
        } catch (ex) {
            logger.error("Twitter.postStatus", status, ex)
        }
    }

    /**
     * Shortcut to postStatus() with the activity details as the status message.
     * @param user The owner of the activity.
     * @param sourceActivity The source Strava activity.
     * @param message Template message to be used.
     */
    postActivity = async (user: UserData, sourceActivity: StravaActivity, message: string): Promise<void> => {
        try {
            const activity = _.cloneDeep(sourceActivity)
            transformActivityFields(user, activity)

            message = jaul.data.replaceTags(message, {user: user.displayName || user.id})
            message = jaul.data.replaceTags(message, activity)

            await this.postStatus(`${message} https://strava.com/activities/${activity.id}`)
        } catch (ex) {
            logger.error("Twitter.postActivity", logHelper.user(user), `Activity ${sourceActivity.id}`, ex)
        }
    }
}

// Exports...
export default Twitter.Instance
