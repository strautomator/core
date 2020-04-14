// Strautomator Core: Strava

import {StravaAPI} from "./api"
import {StravaActivity, StravaGear, StravaProfile, StravaTokens, StravaWebhook, StravaProcessedActivity} from "./types"
import {toStravaActivity, toStravaGear, toStravaProfile} from "./types"
import {UserData} from "../users/types"
import users from "../users"
import database from "../database"
import cache = require("bitecache")
import logger = require("anyhow")
import querystring = require("querystring")
const settings = require("setmeup").settings

/**
 * Strava wrapper.
 */
export class Strava {
    private constructor() {}
    private static _instance: Strava
    static get Instance(): Strava {
        return this._instance || (this._instance = new this())
    }

    /**
     * Strava API reference.
     */
    api: StravaAPI = StravaAPI.Instance

    // INIT
    // --------------------------------------------------------------------------

    /**
     * Init the Strava wrapper.
     */
    init = async (): Promise<void> => {
        await this.api.init()
    }

    // AUTH METHODS
    // --------------------------------------------------------------------------

    /**
     * Get the OAuth2 access token based on the provided authorization code.
     * This method will return null when it fails to get the token.
     * @param code The authorization code provided via the callback URL.
     */
    getToken = async (code: string): Promise<StravaTokens> => {
        try {
            let qs = {
                grant_type: "authorization_code",
                client_id: settings.strava.api.clientId,
                client_secret: settings.strava.api.clientSecret,
                redirect_uri: `${settings.app.url}strava/auth/callback`,
                code: code
            }

            // Post data to Strava.
            const tokenUrl = `${settings.strava.api.tokenUrl}?${querystring.stringify(qs)}`
            const res = await this.api.axios.post(tokenUrl)

            if (res == null || res.data == null) {
                throw new Error("Invalid access token")
            }

            // Save new tokens to database.
            const tokens: StravaTokens = {
                accessToken: res.data.access_token,
                refreshToken: res.data.refresh_token,
                expiresAt: res.data.expires_at
            }

            return tokens
        } catch (ex) {
            logger.error("StravaAPI.getToken", ex)
        }
    }

    /**
     * Refresh OAuth2 tokens from Strava.
     */
    refreshToken = async (refreshToken: string, accessToken?: string): Promise<StravaTokens> => {
        try {
            const qs: any = {
                grant_type: "refresh_token",
                client_id: settings.strava.api.clientId,
                client_secret: settings.strava.api.clientSecret,
                refresh_token: refreshToken
            }

            // Access token was passed?
            if (accessToken) {
                qs.access_token = accessToken
            }

            // Post data to Strava.
            const tokenUrl = `${settings.strava.api.tokenUrl}?${querystring.stringify(qs)}`
            const res = await this.api.axios.post(tokenUrl)

            if (res == null || res.data == null) {
                throw new Error("Invalid or empty token response")
            }
            // Save new tokens to database.
            const tokens: StravaTokens = {
                accessToken: res.data.access_token,
                refreshToken: res.data.refresh_token,
                expiresAt: res.data.expires_at
            }

            return tokens
        } catch (ex) {
            logger.error("StravaAPI.refreshToken", ex)
        }
    }

    // GET METHODS
    // --------------------------------------------------------------------------

    /**
     * Get profile info for the logged user.
     * @param tokens Strava access tokens.
     */
    getAthlete = async (tokens: StravaTokens): Promise<StravaProfile> => {
        try {
            const data = await this.api.get(tokens.accessToken, "athlete")
            const profile = toStravaProfile(data)

            logger.info("Strava.getAthlete", `ID ${profile.id}`, profile.username)
            return profile
        } catch (ex) {
            logger.error("Strava.getAthlete", ex)
            throw ex
        }
    }

    /**
     * Get a single activity from Strava.
     * @param tokens Strava access tokens.
     * @param id The activity ID.
     */
    getActivity = async (tokens: StravaTokens, id: number | string): Promise<StravaActivity> => {
        logger.debug("Strava.getActivity", id)

        try {
            const data = await this.api.get(tokens.accessToken, `activities/${id}`)
            const activity = toStravaActivity(data)

            // First we try fetching gear details from cached database user.
            // Otherwise get directly from the API.
            let user: UserData = cache.get("database", `users-${data.athlete.id}`)
            let gear: StravaGear

            for (let bike of user.profile.bikes) {
                if (bike.id == id) {
                    gear = bike
                }
            }

            for (let shoe of user.profile.shoes) {
                if (shoe.id == id) {
                    gear = shoe
                }
            }

            // Set correct activity gear.
            activity.gear = gear ? gear : await this.getGear(tokens, data.gear_id)

            return activity
        } catch (ex) {
            logger.error("Strava.getActivity", id, ex)
            throw ex
        }
    }

    /**
     * Get list of activities from Strava.
     * @param tokens Strava access tokens.
     * @param query Query options, currently only supports "since".
     */
    getActivities = async (tokens: StravaTokens, query: any): Promise<StravaActivity[]> => {
        logger.debug("Strava.getActivities", query)

        const arrLogQuery = Object.entries(query).map((p) => p[0] + "=" + p[1])
        const logQuery = arrLogQuery.join(", ")

        try {
            // Default query options.
            if (!query.per_page) {
                query.per_page = 200
            }

            // Fetch user activities from Strava.
            let activities = await this.api.get(tokens.accessToken, "athlete/activities", query)

            return activities
        } catch (ex) {
            logger.error("Strava.getActivities", logQuery, ex)
            throw ex
        }
    }

    /**
     * Get gear details from Strava.
     * @param tokens Strava access tokens.
     * @param id The gear ID string.
     */
    getGear = async (tokens: StravaTokens, id: string): Promise<StravaGear> => {
        logger.debug("Strava.getGear", id)

        try {
            const data = await this.api.get(tokens.accessToken, `gear/${id}`)
            const gear = toStravaGear(data)

            return gear
        } catch (ex) {
            logger.error("Strava.getGear", id, ex)
            throw ex
        }
    }

    // SET METHODS
    // --------------------------------------------------------------------------

    /**
     * Updates a single activity on Strava.
     * @param tokens Strava access tokens.
     * @param activity The ativity data.
     * @param fields List of fields that should be updated.
     */
    setActivity = async (tokens: StravaTokens, activity: StravaActivity): Promise<void> => {
        logger.debug("Strava.setActivity", activity.id)

        const logResult = []
        const data = {}

        try {
            if (!activity.updatedFields || activity.updatedFields.length == 0) {
                logger.info("Strava.setActivity", activity.id, "No fields were updated")
                return
            }

            for (let field of activity.updatedFields) {
                data[field] = activity[field]
                logResult.push(`${field}=${activity[field]}`)
            }

            await this.api.put(tokens.accessToken, `activities/${activity.id}`, null, data)

            logger.info("Strava.setActivity", activity.id, logResult.join(", "))
        } catch (ex) {
            logger.error("Strava.setActivity", activity.id, ex, logResult.join(", "))
            throw ex
        }
    }

    // WEBHOOKS
    // --------------------------------------------------------------------------

    /**
     * Check a subscription status based on its ID.
     */
    getSubscriptions = async (): Promise<StravaWebhook[]> => {
        try {
            const query = {
                client_id: settings.strava.api.clientId,
                client_secret: settings.strava.api.clientSecret
            }

            const data = await this.api.get(null, `push_subscriptions`, query)
            logger.info("Strava.getSubscriptions", `${data.length} subscriptions registered`)

            return data
        } catch (ex) {
            logger.error("Strava.getSubscriptions", ex)
            throw ex
        }
    }

    /**
     * Subscribe to activities updates sent by Strava, and return the subscription ID.
     * @param user The relevant user to receive activities from.
     */
    setSubscription = async (user: UserData): Promise<number> => {
        try {
            const query = {
                callback_url: `${settings.app.url}strava/${settings.strava.api.urlToken}/${user.id}`,
                client_id: settings.strava.api.clientId,
                client_secret: settings.strava.api.clientSecret,
                verify_token: settings.strava.api.verifyToken
            }

            const result = await this.api.post(null, "push_subscriptions", query)

            if (!result.id) {
                throw new Error("Missing subscription ID from Strava")
            }

            // Save substription to user on the database.
            user.stravaSubscription = result.id
            await users.update({id: user.id, stravaSubscription: result.id} as UserData, true)

            logger.info("Strava.setSubscription", user.id, user.profile.username, `Subscription ${result.id}`)

            return result.id
        } catch (ex) {
            if (ex.response && ex.response.data && ex.response.data.errors) {
                logger.error("Strava.setSubscription", user.id, ex, ex.response.data.errors[0])
            } else {
                logger.error("Strava.setSubscription", user.id, ex)
            }

            throw ex
        }
    }

    /**
     * Cancel a subscription (mostly called when user cancel the account).
     * @param user The user which should have the subscription cancelled.
     */
    cancelSubscription = async (user: UserData): Promise<void> => {
        try {
            if (!user.stravaSubscription) {
                logger.warn("Strava.cancelSubscription", `User ${user.id}, ${user.profile.username} has no active webhook subscription`)
                return
            }

            const query = {
                client_id: settings.strava.api.clientId,
                client_secret: settings.strava.api.clientSecret
            }

            await this.api.delete(null, `push_subscriptions/${user.stravaSubscription}`, query)
            logger.info("Strava.cancelSubscription", `User ${user.id}, ${user.profile.username}`, `Subscription ${user.stravaSubscription} cancelled`)
        } catch (ex) {
            logger.error("Strava.cancelSubscription", `User ${user.id}, ${user.profile.username}`, ex)
            throw ex
        }
    }

    // DATABASE
    // --------------------------------------------------------------------------

    /**
     * Save a processed activity with user and recipe details to the database.
     * @param user The activity's owner.
     * @param activity The Strava activity details.
     * @param recipes Array of triggered recipe IDs.
     */
    saveProcessedActivity = async (user: UserData, activity: StravaActivity, recipes: string[]): Promise<void> => {
        try {
            const data: StravaProcessedActivity = activity as StravaProcessedActivity

            // Add user details.
            data.user = {
                id: user.id,
                username: user.profile.username
            }

            // Add recipe IDs.
            data.recipes = recipes

            // Save and return result.
            await database.set("activities", data, activity.id.toString())
            logger.debug("Strava.saveProcessedActivity", data)
        } catch (ex) {
            logger.error("Strava.saveProcessedActivity", `User ${user.id} - ${user.profile.username}`, `Activity ${activity.id}`, ex)
        }
    }
}

// Exports...
export default Strava.Instance
