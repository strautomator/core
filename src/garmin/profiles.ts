// Strautomator Core: Garmin Profiles

import {GarminProfile} from "./types"
import {UserData} from "../users/types"
import {FieldValue} from "@google-cloud/firestore"
import api from "./api"
import users from "../users"
import cache from "bitecache"
import logger from "anyhow"
import * as logHelper from "../loghelper"

/**
 * Garmin profiles.
 */
export class GarminProfiles {
    private constructor() {}
    private static _instance: GarminProfiles
    static get Instance() {
        return this._instance || (this._instance = new this())
    }

    /**
     * Get a Garmin profile for the specified user.
     * @param user User requesting the Garmin data.
     */
    getProfile = async (user: UserData): Promise<GarminProfile> => {
        try {
            const cacheId = `profile-${user.id}`
            const cached: GarminProfile = cache.get("garmin", cacheId)
            if (cached) {
                logger.info("Garmin.getProfile", logHelper.user(user), `ID ${cached.id}`, "From cache")
                return cached
            }

            const tokens = user.garmin.tokens

            // Make request to fetch profile.
            const res = await api.makeRequest(tokens, "wellness-api/rest/user/id")
            const profile: GarminProfile = {
                id: res.userId,
                tokens: tokens
            }

            // Save to cache and return the user profile.
            cache.set("garmin", cacheId, profile)
            logger.info("Garmin.getProfile", logHelper.user(user), `ID ${profile.id}`)
            return profile
        } catch (ex) {
            logger.error("Garmin.getProfile", logHelper.user(user), ex)
            throw ex
        }
    }

    /**
     * Save the Garmin profile to the specified user account.
     * @param user The user.
     * @param profile The Garmin profile with tokens.
     */
    saveProfile = async (user: UserData, profile: GarminProfile): Promise<void> => {
        try {
            user.garmin = profile

            const data: Partial<UserData> = {id: user.id, displayName: user.displayName, garmin: profile}
            if (user.garminAuthState) {
                delete user.garminAuthState
                data.garminAuthState = FieldValue.delete() as any
            }

            logger.info("Garmin.saveProfile", logHelper.user(user), `ID ${profile.id}`)
            await users.update(data)
        } catch (ex) {
            logger.error("Garmin.saveProfile", logHelper.user(user), `ID ${profile.id}`, ex)
        }
    }

    /**
     * Unlink the registration and delete the user profile data.
     * @param user User requesting the Garmin data.
     * @param skipDeregistration If true, will not call the deregistration endpoint on Garmin.
     */
    deleteProfile = async (user: UserData, skipDeregistration?: boolean): Promise<void> => {
        try {
            if (!user || !user.garmin) {
                logger.warn("Garmin.deleteProfile", logHelper.user(user), "User has no Garmin profile to delete")
                return
            }

            const profileId = user.garmin.id
            const cacheId = `profile-${user.id}`

            // Make request to unlink profile, unless the skipDeregistration is set.
            if (!skipDeregistration) {
                try {
                    const tokens = user.garmin.tokens
                    await api.makeRequest(tokens, "wellness-api/rest/user/registration", "DELETE")
                } catch (innerEx) {
                    logger.warn("Garmin.deleteProfile", logHelper.user(user), "Failed to deregister user on Garmin")
                }
            }

            // Delete profile from cache and database.
            const data: Partial<UserData> = {id: user.id, displayName: user.displayName, garmin: FieldValue.delete() as any, garminAuthState: FieldValue.delete() as any, garminFailures: FieldValue.delete() as any}
            cache.del("garmin", cacheId)
            await users.update(data)

            logger.info("Garmin.deleteProfile", logHelper.user(user), `Profile ${profileId} deleted`)
        } catch (ex) {
            logger.error("Garmin.deleteProfile", logHelper.user(user), ex)
            throw ex
        }
    }
}

// Exports...
export default GarminProfiles.Instance
