// Strautomator Core: Last.fm

import {LastfmProfile, LastfmRequestOptions} from "./types"
import {MusicTrack} from "../music/types"
import {StravaActivity} from "../strava/types"
import {UserData} from "../users/types"
import {AxiosConfig, axiosRequest} from "../axios"
import users from "../users"
import _ from "lodash"
import cache from "bitecache"
import jaul from "jaul"
import logger from "anyhow"
import * as logHelper from "../loghelper"
import dayjs from "../dayjs"
const settings = require("setmeup").settings

/**
 * Last.fm API wrapper.
 */
export class Lastfm {
    private constructor() {}
    private static _instance: Lastfm
    static get Instance() {
        return this._instance || (this._instance = new this())
    }

    /**
     * Last.fm requests should wait till this timestamp before proceeding.
     */
    rateLimitedUntil: number = 0

    // INIT
    // --------------------------------------------------------------------------

    /**
     * Init the Last.fm wrapper.
     */
    init = async (): Promise<void> => {
        try {
            if (!settings.lastfm.api.key) {
                throw new Error("Missing the lastfm.api.key setting")
            }
            if (!settings.lastfm.api.secret) {
                throw new Error("Missing the lastfm.api.secret setting")
            }

            cache.setup("lastfm", settings.music.cacheDuration)
        } catch (ex) {
            logger.error("Lastfm.init", ex)
            throw ex
        }
    }

    /**
     * Make a request to the Last.fm API.
     * @param reqOptions Last.fm request options.
     */
    private makeRequest = async (reqOptions: LastfmRequestOptions): Promise<any> => {
        const now = dayjs().unix()

        // Defaults to GET.
        if (!reqOptions.method) {
            reqOptions.method = "GET"
        }

        // Transform to axios specific options.
        const options: AxiosConfig = {
            method: reqOptions.method,
            returnResponse: true,
            url: reqOptions.url || `${settings.lastfm.api.baseUrl}${reqOptions.path || ""}`,
            params: reqOptions.params,
            headers: reqOptions.headers
        }
        if (reqOptions.data) {
            options.data = reqOptions.data
        }

        // If we hit the rate limit, make sure to wait before proceeding.
        if (this.rateLimitedUntil > now) {
            const diff = this.rateLimitedUntil - now
            logger.warn("Lastfm.makeRequest", reqOptions.method, options.url, `Rate limited, will wait ${diff} seconds before proceeding`)
            await jaul.io.sleep(diff * 1050)
        }

        // Dispatch the request now.
        try {
            const res = await axiosRequest(options)
            return res ? res.data || res : null
        } catch (ex) {
            const status = ex.response?.status || null
            const headers = ex.response?.headers || null

            // Rate limited? Try again later.
            if (status == 429 && headers?.["retry-after"]) {
                const seconds = parseInt(headers["retry-after"])
                logger.error("Lastfm.makeRequest", reqOptions.method, options.url, `Rate limited, will try again in around ${seconds}s`)

                if (this.rateLimitedUntil <= now) {
                    this.rateLimitedUntil = now + seconds
                }

                await jaul.io.sleep(seconds * 1050)
                try {
                    const res = await axiosRequest(options)
                    return res ? res.data || res : null
                } catch (innerEx) {
                    logger.error("Lastfm.makeRequest", reqOptions.method, options.url, "Failed again, won't retry", ex)
                    throw ex
                }
            }

            throw ex
        }
    }

    // METHODS
    // --------------------------------------------------------------------------

    /**
     * Get the public Last.fm profile for the specified username.
     * @param user The Strautomator user. Defaults to the user's saved Last.fm profile.
     */
    getProfile = async (user: UserData, username?: string): Promise<LastfmProfile> => {
        try {
            if (!username) {
                username = user.lastfm?.username
            }
            if (!username) {
                throw new Error("Missing Last.fm username")
            }

            const cacheId = `profile-${username.toLowerCase()}`
            const cached: LastfmProfile = cache.get("lastfm", cacheId)
            if (cached) {
                logger.info("Lastfm.getProfile", logHelper.user(user), `Username ${cached.username}`, "From cache")
                return cached
            }

            const res = await this.makeRequest({
                params: {
                    method: "user.getInfo",
                    user: username,
                    api_key: settings.lastfm.api.key,
                    format: "json"
                }
            })

            if (!res?.user) {
                throw new Error(`Last.fm user not found: ${username}`)
            }

            const profile: LastfmProfile = {
                username: res.user.name,
                playcount: parseInt(res.user.playcount) || 0
            }

            cache.set("lastfm", cacheId, profile)
            logger.info("Lastfm.getProfile", logHelper.user(user), `Username ${profile.username}`, `Playcount: ${profile.playcount}`)
            return profile
        } catch (ex) {
            logger.error("Lastfm.getProfile", logHelper.user(user), username, ex)
            throw ex
        }
    }

    /**
     * Helper to transform data from the Last.fm API to a MusicTrack interface.
     * @param data Input data.
     */
    private toMusicTrack = (data: any): MusicTrack => {
        if (!data || !data.name) return null

        const artistName: string = data.artist?.["#text"] || data.artist?.name || (typeof data.artist == "string" ? data.artist : "")
        const fallbackId = artistName ? `${artistName}-${data.name}`.toLowerCase().replace(/\s+/g, "-") : data.name

        const result: MusicTrack = {
            id: data.mbid || fallbackId,
            name: data.name,
            artist: artistName,
            title: artistName ? `${artistName} - ${data.name}` : data.name
        }

        // Optional play date.
        if (data.date?.uts) {
            result.datePlayed = dayjs.unix(parseInt(data.date.uts)).toDate()
        }

        return result
    }

    /**
     * Get list of played tracks for the specified user activity.
     * Exceptions won't be thrown, will return null instead.
     * @param user The user.
     * @param activity The Strava activity.
     */
    getActivityTracks = async (user: UserData, activity: StravaActivity): Promise<MusicTrack[]> => {
        try {
            if (!user.lastfm?.username) {
                throw new Error("User has no Last.fm account linked")
            }

            const username = user.lastfm.username

            const cacheId = `tracks-${activity.id}`
            const cached: MusicTrack[] = cache.get("lastfm", cacheId)
            if (cached) {
                logger.info("Lastfm.getActivityTracks", logHelper.user(user), logHelper.activity(activity), `Got ${cached.length || "no"} tracks`, "From cache")
                return cached
            }

            const addedBuffer = settings.music.dateBufferSeconds
            const tsFrom = Math.floor(activity.dateStart.valueOf() / 1000) + activity.utcStartOffset * 60 - addedBuffer
            const tsTo = Math.floor(activity.dateEnd.valueOf() / 1000) + activity.utcStartOffset * 60

            // Make request to fetch list of recent tracks within the activity timespan.
            const res = await this.makeRequest({
                params: {
                    method: "user.getRecentTracks",
                    user: username,
                    api_key: settings.lastfm.api.key,
                    format: "json",
                    from: tsFrom,
                    to: tsTo,
                    limit: settings.music.trackLimit
                }
            })

            const rawTracks = res?.recenttracks?.track || []
            const items = Array.isArray(rawTracks) ? rawTracks : [rawTracks]

            // Filter out "now playing" entries (no date) and sort by play date.
            const valid = items.filter((t) => t && t.date?.uts)
            const sorted = _.sortBy(valid, (t) => parseInt(t.date.uts))

            // Iterate, transform and populate track list.
            const tracks: MusicTrack[] = []
            for (let i of sorted) {
                const track = this.toMusicTrack(i)
                if (track) tracks.push(track)
            }

            // Save to cache and return list of activity tracks.
            cache.set("lastfm", cacheId, tracks)
            logger.info("Lastfm.getActivityTracks", logHelper.user(user), logHelper.activity(activity), `Got ${tracks.length || "no"} tracks`)

            return tracks
        } catch (ex) {
            logger.error("Lastfm.getActivityTracks", logHelper.user(user), logHelper.activity(activity), ex)

            return null
        }
    }

    // DATABASE
    // --------------------------------------------------------------------------

    /**
     * Save the Last.fm profile to the specified user account.
     * @param user The user.
     * @param profile The Last.fm profile.
     */
    saveProfile = async (user: UserData, profile: LastfmProfile): Promise<void> => {
        try {
            user.lastfm = profile
            await users.update({id: user.id, displayName: user.displayName, lastfm: profile})
            logger.info("Lastfm.saveProfile", logHelper.user(user), `ID ${profile.username}`)
        } catch (ex) {
            logger.error("Lastfm.saveProfile", logHelper.user(user), `ID ${profile.username}`, ex)
        }
    }
}

// Exports...
export default Lastfm.Instance
