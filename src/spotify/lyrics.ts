// Strautomator Core: Lyrics

import {SpotifyTrack, TrackLyrics} from "./types"
import {axiosRequest} from "../axios"
import database from "../database"
import cache from "bitecache"
import jaul from "jaul"
import logger from "anyhow"
import dayjs from "../dayjs"
import * as logHelper from "../loghelper"
const settings = require("setmeup").settings

/**
 * Make a request to the Genius API.
 * @param track Spotify track.
 */
const fromGenius = async (track: SpotifyTrack): Promise<string> => {
    if (!settings.genius.api.token) {
        logger.warn("Spotify.lyrics.fromGenius", logHelper.spotifyTrack(track), "Missing settings.genius.api.token, won't fetch")
        return null
    }

    try {
        logger.debug("Spotify.lyrics.fromGenius", logHelper.spotifyTrack(track), "Fetching lyrics from Genius")

        // Try fetching the lyrics for each one of the listed track artists.
        for (let artist of track.artists) {
            const term = `${artist} ${track.name.trim()}`
            const url = `${settings.genius.api.baseUrl}search?q=${term}`
            const headers = {Authorization: `Bearer ${settings.genius.api.token}`}
            const options: any = {url, headers}

            // Query the Genius API. If found scrape the lyrics from the HTML page.
            const res = await axiosRequest(options)
            if (res?.response?.hits?.length > 0) {
                const songs = res.response.hits.filter((h) => h.type == "song" && h.result.lyrics_state == "complete")

                for (let song of songs) {
                    const resHtml = await axiosRequest({url: `${settings.genius.url}${song.result.path.substring(1)}`})
                    if (resHtml) {
                        let html: string = resHtml
                        html = html.substring(html.indexOf("PRELOADED_STATE"))
                        html = html.substring(html.indexOf("body"))
                        html = html.substring(html.indexOf("html"))
                        html = html.substring(html.indexOf("<p>") + 3)
                        html = html.substring(0, html.indexOf("/p>"))
                        html = jaul.data.stripHtml(html).replace(/\\n/g, "\n").replace(/\\/g, "")
                        if (html.length > 10) {
                            return html
                        }
                    }
                }
            }
        }
    } catch (ex) {
        logger.error("Spotify.lyrics.fromGenius", logHelper.spotifyTrack(track), ex)
        throw ex
    }
}

/**
 * Make a request to the STANDS4 API.
 * @param track Spotify track.
 */
const fromStands4 = async (track: SpotifyTrack): Promise<string> => {
    if (!settings.stands4.api.token) {
        logger.warn("Spotify.lyrics.fromStands4", logHelper.spotifyTrack(track), "Missing settings.stands4.api.token, won't fetch")
        return null
    }

    try {
        logger.debug("Spotify.lyrics.fromStands4", logHelper.spotifyTrack(track), "Fetching lyrics from STANDS4")

        // Try fetching the lyrics for each one of the listed track artists.
        for (let artist of track.artists) {
            const url = `${settings.stands4.api.baseUrl}?format=json&uid=${settings.stands4.api.uid}&tokenid=${settings.stands4.api.token}&artist=${artist}&term=${track.name.trim()}`
            const options: any = {url}

            // Query the STANDS4 API, and if found, scrape the lyrics from the HTML page.
            const res = await axiosRequest(options)
            if (res?.result?.length > 0) {
                const resHtml = await axiosRequest({url: res.result[0]["song-link"]})
                if (resHtml) {
                    let html: string = resHtml
                    html = html.substring(html.indexOf(`id="lyric-body-text"`))
                    html = html.substring(html.indexOf(">") + 1)
                    html = html.substring(0, html.indexOf("</pre>"))
                    html = jaul.data.stripHtml(html)
                    if (html.length > 10) {
                        return html
                    }
                }
            }
        }
    } catch (ex) {
        logger.error("Spotify.lyrics.fromStands4", logHelper.spotifyTrack(track), ex)
        throw ex
    }

    return null
}

// METHODS
// --------------------------------------------------------------------------

/**
 * Get the lyrics for the specified Spotify track. Never throws, will return
 * an empty string if failed.
 * @param track Spotify track.
 */
export const getLyrics = async (track: SpotifyTrack): Promise<string> => {
    try {
        const cacheId = `lyrics-${track.id}`
        const cached: string = cache.get("spotify", cacheId)
        if (cached) {
            logger.info("Spotify.getLyrics.fromCache", logHelper.spotifyTrack(track), "From memory")
            return cached
        }

        // Check if lyrics are available in the database cache as well.
        const dbCached: TrackLyrics = await database.get("lyrics", track.id)
        if (dbCached) {
            logger.info("Spotify.getLyrics.fromCache", logHelper.spotifyTrack(track), "From database")
            return dbCached.lyrics
        }

        // First try the STANDS4 API.
        // Nothing found? Try again with Genius.
        let lyrics = await fromStands4(track)
        if (!lyrics) {
            lyrics = await fromGenius(track)
        }

        // No lyrics found.
        if (!lyrics) {
            logger.info("Spotify.getLyrics", logHelper.spotifyTrack(track), "Lyrics not found")
            cache.set("spotify", cacheId, null)
            return null
        }

        // Save to database, if found.
        const dbEntry: TrackLyrics = {
            id: track.id,
            lyrics: lyrics,
            dateExpiry: dayjs().add(settings.spotify.maxCacheDuration, "seconds").toDate()
        }

        await database.set("lyrics", dbEntry, track.id)
        cache.set("spotify", cacheId, lyrics)
        logger.info("Spotify.getLyrics", logHelper.spotifyTrack(track), `Length: ${lyrics.length}`)

        return lyrics
    } catch (ex) {
        logger.error("Spotify.getLyrics", logHelper.spotifyTrack(track), ex)
        return null
    }
}
