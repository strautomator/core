// Strautomator Web: API request authentication

import {logHelper, strava, users} from "strautomator-core"
import type {UserData} from "strautomator-core"
import {getRequestHeader, getRouterParam, type RequestEvent} from "nuxt/server"
import {isAppOriginUrl} from "./urls"
import {WebError, getClientIP} from "./web"
import cache from "bitecache"
import crypto from "node:crypto"
import logger from "anyhow"
import setmeup from "setmeup"
const settings = setmeup.settings

let cacheReady = false

/**
 * Request validation options.
 */
export interface RequestOptions {
    /** Accept unauthenticated requests. */
    anonymous?: boolean
    /** Accept previous access token (in case user was logged in for too long). */
    acceptPreviousToken?: boolean
    /** Requesting an image? Accept requests only from the Strautomator referer. */
    image?: boolean
    /** Accept requests only from the Strautomator referer. */
    referer?: boolean
}

/**
 * Validate the request according to the passed options. Returns the user (if identified)
 * or true (if anonymous requests are allowed). Throws a WebError if not authorized.
 * @param event The request event.
 * @param options Additional validation options.
 */
export async function requestValidator(event: RequestEvent, options: RequestOptions & {anonymous: true}): Promise<UserData | true>
export async function requestValidator(event: RequestEvent, options?: RequestOptions): Promise<UserData>
export async function requestValidator(event: RequestEvent, options?: RequestOptions): Promise<UserData | true> {
    if (!cacheReady) {
        cache.setup("auth-token-users", settings.oauth.tokenCacheSeconds)
        cache.setup("auth-invalid-tokens", settings.oauth.tokenCacheSeconds)
        cacheReady = true
    }

    const path = event.url.pathname + event.url.search

    try {
        const bearer = getRequestHeader(event, "authorization")

        if (!options) {
            options = {}
        }

        // Check for referer instead of token? Will use same URL set for CORS.
        if (options.referer) {
            const referer = getRequestHeader(event, "referer") || "unknown"

            if (!isAppOriginUrl(referer, settings.app.url)) {
                logger.error("Auth.requestValidator", path, `Invalid referer: ${referer}`, `From ${getClientIP(event)}`)
                throw new WebError("Access denied", 403, new Response("Access denied", {status: 403, headers: {"Cache-Control": "no-cache"}}))
            }

            if (options.anonymous) {
                return true
            }
        }

        // Auth bearer header is mandatory.
        if (!bearer) {
            throw new WebError("Missing token", 401)
        }

        // Token recently seen as invalid? Stop here, without hitting the database or Strava.
        const token: string = bearer.substring(1, 6) == "earer" ? bearer.substring(6).trim() : bearer.trim()
        const tokenHash = crypto.createHash("sha256").update(token).digest("hex")
        if (cache.get("auth-invalid-tokens", tokenHash)) {
            throw new WebError("User not found", 404)
        }

        // Token recently matched to a user? Get the user directly, and make sure the token is still valid.
        let user: UserData = null
        const cachedUserId: string = cache.get("auth-token-users", tokenHash)
        if (cachedUserId) {
            user = await users.getById(cachedUserId)
            if (user && user.stravaTokens?.accessToken != token && user.stravaTokens?.previousAccessToken != token) {
                user = null
            }
        }
        const fromCache = user ? true : false
        if (cachedUserId && !fromCache) {
            cache.del("auth-token-users", tokenHash)
        }

        // Find user by token.
        if (!user) {
            user = await users.getByToken({accessToken: token})
        }
        if (!user && options.acceptPreviousToken) {
            user = await users.getByToken({previousAccessToken: token})
        }

        // User not found? Maybe has a new token? Tokens rejected by Strava are cached as invalid.
        if (!user) {
            let athlete = null
            try {
                athlete = await strava.athletes.getAthlete({accessToken: token})
            } catch (athleteEx) {
                const status = athleteEx.response?.status || athleteEx.statusCode
                if (status == 401 || status == 403) {
                    cache.set("auth-invalid-tokens", tokenHash, true)
                }
                throw athleteEx
            }

            // User token is valid on Strava? Update previous token saved on the database.
            if (athlete) {
                user = await users.getById(athlete.id)

                if (user) {
                    user.stravaTokens.accessToken = token
                    const newUserData = {
                        id: user.id,
                        displayName: user.preferences.privacyMode ? user.id : user.displayName,
                        stravaTokens: {previousAccessToken: token}
                    }

                    await users.update(newUserData)
                    logger.info("Auth.requestValidator", path, `Updated previous Strava token for ${logHelper.user(user)}`)
                }
            }
        }

        // User really not found?
        if (!user) {
            throw new WebError("User not found", 404)
        }

        // User ID does not match the one passed on the route?
        const userId = getRouterParam(event, "userId")
        if (userId && userId != user.id) {
            throw new WebError("User not authorized", 401)
        }

        if (!fromCache) {
            cache.set("auth-token-users", tokenHash, user.id)
        }
        return user
    } catch (ex) {
        if (ex instanceof WebError) {
            throw ex
        }
        throw new WebError(ex, 401)
    }
}
