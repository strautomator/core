// Strautomator Core: Wahoo Profiles

import {WahooProfile, WahooTokens} from "./types"
import {UserData} from "../users/types"
import {FieldValue} from "@google-cloud/firestore"
import api from "./api"
import users from "../users"
import _ from "lodash"
import cache from "bitecache"
import logger from "anyhow"
import * as logHelper from "../loghelper"

/**
 * Wahoo API profiles.
 */
export class WahooProfiles {
    private constructor() {}
    private static _instance: WahooProfiles
    static get Instance() {
        return this._instance || (this._instance = new this())
    }

    /**
     * Get a Wahoo profile for the specified user.
     * @param user User requesting the Wahoo profile data.
     * @param tokens Optional tokens to be used to fetch the profile.
     */
    getProfile = async (user: UserData, tokens?: WahooTokens): Promise<WahooProfile> => {
        try {
            const cacheId = `profile-${user.id}`
            const cached: WahooProfile = cache.get("wahoo", cacheId)
            if (cached) {
                logger.info("Wahoo.getProfile", logHelper.user(user), `ID ${cached.id}`, "From cache")
                return cached
            }

            // Validate and use the existing tokens if none were passed.
            if (!tokens) {
                await api.validateTokens(user)
                tokens = user.wahoo.tokens
            }

            // Make request to fetch profile.
            const res = await api.makeRequest(tokens, "v1/user")
            const profile: WahooProfile = {
                id: res.id,
                email: res.email,
                tokens: tokens
            }

            // Save to cache and return the user profile.
            cache.set("wahoo", cacheId, profile)
            logger.info("Wahoo.getProfile", logHelper.user(user), `ID ${profile.id}`)

            return profile
        } catch (ex) {
            const err = logger.error("Wahoo.getProfile", logHelper.user(user), ex)
            api.processAuthError(user, err)
            throw ex
        }
    }

    /**
     * Save the Wahoo profile to the specified user account.
     * This will also set the user's email, if it's currently blank.
     * @param user The user.
     * @param profile The Wahoo profile with tokens.
     */
    saveProfile = async (user: UserData, profile: WahooProfile): Promise<void> => {
        try {
            const data: Partial<UserData> = {id: user.id, displayName: user.displayName, wahoo: profile}
            if (profile.email && !user.email) {
                data.email = profile.email
            }

            // We don't need to store the user's email.
            delete profile.email

            if (user.wahooAuthState) {
                data.wahooAuthState = FieldValue.delete() as any
            }

            logger.info("Wahoo.saveProfile", logHelper.user(user), `ID ${profile.id}`)
            await users.update(data)

            user.wahoo = profile
        } catch (ex) {
            logger.error("Wahoo.saveProfile", logHelper.user(user), `ID ${profile.id}`, ex)
        }
    }

    /**
     * Helper to refresh the Wahoo profile for the specified user (getProfile + saveProfile).
     * @param user The user that should be refreshed.
     */
    refreshProfile = async (user: UserData): Promise<void> => {
        try {
            if (!user || !user.wahoo?.tokens) {
                throw new Error("User has no Wahoo access tokens")
            }

            const profile = await this.getProfile(user)
            await this.saveProfile(user, profile)
        } catch (ex) {
            logger.error("Wahoo.refreshProfile", logHelper.user(user), ex)
        }
    }

    /**
     * Clear the Wahoo profile for the specified user account.
     * @param user The user.
     */
    deleteProfile = async (user: UserData): Promise<void> => {
        try {
            if (!user || !user.wahoo) {
                logger.warn("Wahoo.deleteProfile", logHelper.user(user), "User has no Wahoo profile to delete")
                return
            }

            const profileId = user.wahoo.id
            const cacheId = `profile-${user.id}`

            // Revoke the token.
            await api.revokeToken(user)

            // Delete profile from cache and database.
            const data: Partial<UserData> = {id: user.id, displayName: user.displayName, wahoo: FieldValue.delete() as any, wahooAuthState: FieldValue.delete() as any}
            cache.del("wahoo", cacheId)
            await users.update(data)

            logger.info("Wahoo.deleteProfile", logHelper.user(user), `Profile ${profileId} deleted`)
        } catch (ex) {
            logger.error("Wahoo.deleteProfile", logHelper.user(user), ex)
        }
    }
}

// Exports...
export default WahooProfiles.Instance
