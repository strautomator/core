// Strautomator Core: Polyline
// Based on the original @mapbox/linematch

import Flatbush from "flatbush"
import polyline = require("@mapbox/polyline")
import logger from "anyhow"

/**
 * Polyline helper class.
 */
export class Polyline {
    private constructor() {}
    private static _instance: Polyline
    static get Instance() {
        return this._instance || (this._instance = new this())
    }

    /**
     * Encode the passed coordinates into a polyline.
     * @param coordinates Coordinates to be encoded.
     */
    encode = (coordinates: [number, number][]): string => {
        try {
            return polyline.encode(coordinates)
        } catch (ex) {
            logger.error("Polylines.encode", `${coordinates.length} coordinates`, ex)
            throw ex
        }
    }

    /**
     * Decodes the passed polyline string and returns an array of coordinates.
     * @param value The polyline string.
     */
    decode = (value: string): number[][] => {
        try {
            return polyline.decode(value)
        } catch (ex) {
            logger.error("Polylines.decode", value, ex)
            throw ex
        }
    }

    /**
     * Compare 2 sets of polylines and return the different segments.
     * @param lines1 First polyline.
     * @param lines2 Second polyline.
     * @param threshold Threshold, where 0 is identical, 0.005 is 550m of difference, and so on.
     */
    compare = (lines1: any[], lines2: any[], threshold: number) => {
        if (threshold < 0) threshold = 0

        let segments = this.linesToSegments(lines1)
        let segments2 = this.linesToSegments(lines2)
        let index = new Flatbush(segments2.length / 4)

        for (let i = 0; i < segments2.length; i += 4) {
            index.add(Math.min(segments2[i + 0], segments2[i + 2]), Math.min(segments2[i + 1], segments2[i + 3]), Math.max(segments2[i + 0], segments2[i + 2]), Math.max(segments2[i + 1], segments2[i + 3]))
        }

        index.finish()

        let diff = []
        let last

        while (segments.length) {
            let by = segments.pop()
            let bx = segments.pop()
            let ay = segments.pop()
            let ax = segments.pop()

            let other = index.search(
                Math.min(ax, bx) - threshold, // minX
                Math.min(ay, by) - threshold, // minY
                Math.max(ax, bx) + threshold, // maxX
                Math.max(ay, by) + threshold // maxY
            )
            let overlap = false

            // Loop through segments close to the current one, looking for matches, and if a
            // match is found then unmatched parts of the segment will be added to the queue.
            for (let j = 0; j < other.length; j++) {
                let k = other[j] * 4
                let matched = this.matchSegment(ax, ay, bx, by, segments2[k + 0], segments2[k + 1], segments2[k + 2], segments2[k + 3], threshold, segments)
                if (matched) {
                    overlap = true
                    break
                }
            }

            // If segment didn't match any other segments, add it to the diff.
            if (!overlap) {
                let p = last && last[last.length - 1]

                if (p && p[0] === ax && p[1] === ay) {
                    last.push([bx, by])
                } else {
                    last = [
                        [ax, ay],
                        [bx, by]
                    ]
                    diff.push(last)
                }
            }
        }

        return diff
    }

    // INTERNAL HELPERS
    // --------------------------------------------------------------------------

    linesToSegments = (lines) => {
        let segments = []

        for (let i = 0; i < lines.length; i++) {
            let line = lines[i]

            for (let j = line.length - 1; j > 0; j--) {
                let a = line[j - 1]
                let b = line[j]
                if (a[0] !== b[0] || a[1] !== b[1]) {
                    this.addSegment(segments, a[0], a[1], b[0], b[1])
                }
            }
        }

        return segments
    }

    matchSegment = (ax, ay, bx, by, cx, cy, dx, dy, r, result) => {
        let len = result.length

        let ap = this.closePoint(ax, ay, cx, cy, dx, dy, r)
        let bp = this.closePoint(bx, by, cx, cy, dx, dy, r)

        if (ap !== null && bp !== null) return true // fully covered

        let cp = this.closePoint(cx, cy, ax, ay, bx, by, r)
        let dp = this.closePoint(dx, dy, ax, ay, bx, by, r)

        if (cp !== null && cp === dp) return false // degenerate case, no overlap

        let cpx, cpy, dpx, dpy
        if (cp !== null) {
            cpx = this.interp(ax, bx, cp)
            cpy = this.interp(ay, by, cp)
        }
        if (dp !== null) {
            dpx = this.interp(ax, bx, dp)
            dpy = this.interp(ay, by, dp)
        }

        if (cp !== null && dp !== null) {
            if (cpx === dpx && cpy === dpy) return false

            if (cp < dp) {
                if (!this.equals(ax, ay, cpx, cpy)) this.addSegment(result, ax, ay, cpx, cpy)
                if (!this.equals(dpx, dpy, bx, by)) this.addSegment(result, dpx, dpy, bx, by)
            } else {
                if (!this.equals(ax, ay, dpx, dpy)) this.addSegment(result, ax, ay, dpx, dpy)
                if (!this.equals(cpx, cpy, bx, by)) this.addSegment(result, cpx, cpy, bx, by)
            }
        } else if (cp !== null) {
            if (ap !== null && !this.equals(ax, ay, cpx, cpy)) this.addSegment(result, cpx, cpy, bx, by)
            else if (bp !== null && !this.equals(cpx, cpy, bx, by)) this.addSegment(result, ax, ay, cpx, cpy)
        } else if (dp !== null) {
            if (bp !== null && !this.equals(dpx, dpy, bx, by)) this.addSegment(result, ax, ay, dpx, dpy)
            else if (ap !== null && !this.equals(ax, ay, dpx, dpy)) this.addSegment(result, dpx, dpy, bx, by)
        }

        return result.length !== len
    }

    addSegment = (arr, ax, ay, bx, by) => {
        arr.push(ax)
        arr.push(ay)
        arr.push(bx)
        arr.push(by)
    }

    interp = (a, b, t) => {
        return a + (b - a) * t
    }

    closePoint = (px, py, ax, ay, bx, by, r) => {
        let t
        let x = ax,
            y = ay,
            dx = bx - x,
            dy = by - y

        if (dx !== 0 || dy !== 0) {
            t = ((px - x) * dx + (py - y) * dy) / (dx * dx + dy * dy)

            if (t >= 1) {
                x = bx
                y = by
                t = 1
            } else if (t > 0) {
                x += dx * t
                y += dy * t
            } else {
                t = 0
            }
        }

        dx = px - x
        dy = py - y

        return dx * dx + dy * dy < r * r ? t : null
    }

    equals = (ax, ay, bx, by) => {
        let dx = Math.abs(ax - bx)
        let dy = Math.abs(ay - by)
        return dx < 1e-12 && dy < 1e-12
    }
}

// Exports...
export default Polyline.Instance
