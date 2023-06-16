// Strautomator Core: Twitter

import {TwitterState} from "./types"
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
import dayjs from "../dayjs"
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
     * Twitter state details.
     */
    state: TwitterState = {}

    /**
     * Check if the client is currently rate limited.
     */
    get isRateLimited() {
        return this.state.dateRateLimitReset && dayjs.utc().isAfter(this.state.dateRateLimitReset)
    }

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
            const fromCache: TwitterState = await database.appState.get("twitter")
            if (fromCache) {
                this.state = fromCache
                logger.debug("Twitter.init", `Screen name from cache: ${this.state.screenName}`)
            }

            // Get user screen name straight away, but only if quickStart was not set.
            if (!quickStart) {
                await this.client.appLogin()
                await this.getAccountDetails()
            } else {
                this.client.appLogin()
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
        if (this.isRateLimited) {
            logger.warn("Twitter.getAccountDetails", "Currently rate limited, abort")
            return
        }

        // Stop here if the account details were recently refreshed.
        const minDate = dayjs().subtract(settings.twitter.accountRefreshInterval, "seconds")
        if (this.state.dateAccountRefreshed && minDate.isBefore(this.state.dateAccountRefreshed)) {
            logger.debug("Twitter.getAccountDetails", "Recently refreshed, abort")
            return
        }

        try {
            const res = await this.client.readOnly.v2.me()

            // Update state data.
            this.state.screenName = res.data.username
            this.state.dateAccountRefreshed = new Date()
            await database.appState.set("twitter", this.state)

            logger.info("Twitter.getAccountDetails", `Logged as ${this.state.screenName}`)
            return res
        } catch (ex) {
            logger.error("Twitter.getAccountDetails", ex)
            await this.checkRateLimit(ex)
        }
    }

    // POSTING TO TWITTER
    // --------------------------------------------------------------------------

    /**
     * Post a message to Twitter.
     * @param status Status to be posted to Twitter.
     */
    postStatus = async (status: string): Promise<void> => {
        if (this.isRateLimited) {
            logger.warn("Twitter.postStatus", "Currently rate limited, abort", status)
            return
        }

        try {
            await this.client.readWrite.v2.tweet(status)
            logger.info("Twitter.postStatus", status)
        } catch (ex) {
            logger.error("Twitter.postStatus", status, ex)
            await this.checkRateLimit(ex)
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

    // HELPERS
    // --------------------------------------------------------------------------

    /**
     * Check exception details to handle rate limits.
     * @param err Exception thrown by the Twitter API.
     */
    checkRateLimit = async (err: any): Promise<void> => {
        try {
            if (!err || !err.rateLimit) {
                logger.debug("Twitter.checkRateLimit", "Last error is not rate limit related")
                return
            }

            const now = dayjs.utc().unix()

            // Check if we have reached the API rate limits.
            if (err.rateLimit.remaining < 2 && now < err.rateLimit.reset) {
                const dateReset = dayjs.unix(err.rateLimit.reset).utc()

                // Rate limited, save to the database.
                if (!this.state.dateRateLimitReset || dateReset.isAfter(this.state.dateRateLimitReset)) {
                    logger.warn("Twitter.checkRateLimit", `Rate limited, will reset at ${dateReset.format("YYYY-MM-DD HH:mm:ss")}`)
                    this.state.dateRateLimitReset = dateReset.toDate()
                    await database.appState.set("twitter", this.state)
                }
            }
        } catch (ex) {
            logger.error("Twitter.checkRateLimit", ex)
        }
    }
}

// Exports...
export default Twitter.Instance
