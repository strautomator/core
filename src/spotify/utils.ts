// Strautomator Core: Spotify Utils

import {SpotifyTrack} from "./types"
import dayjs from "../dayjs"

/**
 * Helper to transform data from the API to a SpotifyTrack interface.
 * @param data Input data.
 */
export function toSpotifyTrack(data: any): SpotifyTrack {
    const track = data.track ? data.track : data
    const artists: string[] = track.artists.map((a) => a.name)
    const artistString: string = artists.filter((a) => !track.name.includes(a)).join(", ")
    const seconds = Math.ceil(track.duration_ms / 1000)

    const result: SpotifyTrack = {
        id: track.id,
        name: track.name,
        artists: artists,
        title: `${artistString} - ${track.name}`,
        duration: dayjs.duration(seconds, "seconds").format("mm:ss")
    }

    // Optional play date.
    if (data.played_at) {
        result.datePlayed = dayjs(data.played_at).toDate()
    }

    return result
}
