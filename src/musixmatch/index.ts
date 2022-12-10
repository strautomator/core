// Strautomator Core: musixmatch

import {MusixmatchLyrics} from "./types"
import {SpotifyTrack} from "../spotify/types"
import {axiosRequest} from "../axios"
import database from "../database"
import cache from "bitecache"
import logger from "anyhow"
import dayjs from "../dayjs"
const settings = require("setmeup").settings
const packageVersion = require("../../package.json").version

/**
 * musixmatch API wrapper.
 */
export class Musixmatch {
    private constructor() {}
    private static _instance: Musixmatch
    static get Instance() {
        return this._instance || (this._instance = new this())
    }

    // INIT
    // --------------------------------------------------------------------------

    /**
     * Init the musixmatch wrapper.
     */
    init = async (): Promise<void> => {
        try {
            if (!settings.musixmatch.api.key) {
                throw new Error("Missing the musixmatch.api.key setting")
            }

            cache.setup("musixmatch", settings.musixmatch.cacheDuration)
        } catch (ex) {
            logger.error("Musixmatch.init", ex)
            throw ex
        }
    }

    /**
     * Make a request to the musixmatch API.
     * @param path URL path.
     */
    private makeRequest = async (path: string): Promise<any> => {
        const options: any = {
            method: "GET",
            returnResponse: true,
            url: `${settings.musixmatch.api.baseUrl}${path}&apikey=${settings.musixmatch.api.key}`,
            headers: {
                "User-Agent": `${settings.app.title} / ${packageVersion}`
            }
        }

        try {
            const res = await axiosRequest(options)
            return res ? res.data : null
        } catch (ex) {
            logger.error("Musixmatch.makeRequest", path, ex)
            throw ex
        }
    }

    // METHODS
    // --------------------------------------------------------------------------

    /**
     * Get the lyrics for the specified Spotify track.
     * @param track Spotify track.
     */
    getLyrics = async (track: SpotifyTrack): Promise<string> => {
        try {
            const cacheId = `lyrics-${track.id}`
            const cached: string = cache.get("musixmatch", cacheId)
            if (cached) {
                logger.info("Musixmatch.getLyrics.fromCache", track.title, "From cache")
                return cached
            }

            // Check if lyrics are available in the database cache first.
            const dbCached: MusixmatchLyrics = await database.get("lyrics", track.id)
            if (dbCached) {
                logger.info("Musixmatch.getLyrics.fromCache", track.title, "From cache")
                return dbCached.lyrics
            }

            let lyrics: string
            let index = 0

            // Try fetching the lyrics using each of the track artists separately.
            while (!lyrics && index < track.artists.length) {
                const res = await this.makeRequest(`matcher.lyrics.get?q_track=${encodeURIComponent(track.name)}&q_artist=${encodeURIComponent(track.artists[index])}`)

                if (res?.message?.body?.lyrics) {
                    lyrics = res.message.body.lyrics.lyrics_body
                } else {
                    index++
                }
            }

            // No lyrics found.
            if (!lyrics) {
                logger.info("Musixmatch.getLyrics", track.title, "Lyrics not found")
                cache.set("musixmatch", cacheId, null)
                return null
            }

            // Save to database.
            const dbEntry: MusixmatchLyrics = {
                id: track.id,
                lyrics: lyrics,
                dateExpiry: dayjs().add(settings.musixmatch.maxCacheDuration, "seconds").toDate()
            }
            await database.set("lyrics", dbEntry, track.id)
            cache.set("musixmatch", cacheId, lyrics)
            logger.info("Musixmatch.getLyrics", track.title, `Length: ${lyrics.length}`)

            return lyrics
        } catch (ex) {
            logger.error("Musixmatch.getLyrics", track.title, ex)
            throw ex
        }
    }
}

// Exports...
export default Musixmatch.Instance
