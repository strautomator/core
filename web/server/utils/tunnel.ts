// Strautomator Web: Dev Cloudflare tunnel lifecycle

import {spawn, type ChildProcessWithoutNullStreams} from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import logger from "anyhow"

const PID_FILE = path.join(process.cwd(), ".cloudflared", "dev-tunnel.pid")

const isRunning = (pid: number): boolean => {
    try {
        process.kill(pid, 0)
        return true
    } catch {
        return false
    }
}

const readPid = (): number | null => {
    try {
        const pid = Number.parseInt(fs.readFileSync(PID_FILE, "utf8"), 10)
        return Number.isFinite(pid) && pid > 0 ? pid : null
    } catch {
        return null
    }
}

const writePid = (pid: number): void => {
    fs.mkdirSync(path.dirname(PID_FILE), {recursive: true})
    fs.writeFileSync(PID_FILE, String(pid))
}

const clearPid = (): void => {
    try {
        fs.unlinkSync(PID_FILE)
    } catch {
        // File already gone.
    }
}

/**
 * Stop the dev tunnel started by this app. Safe to call when none is running.
 */
export const stopDevTunnel = (): void => {
    const pid = readPid()
    if (!pid) return

    clearPid()
    if (!isRunning(pid)) return

    try {
        process.kill(pid, "SIGTERM")
    } catch (ex) {
        logger.warn("Tunnel", "Could not stop cloudflared", ex)
    }
}

/**
 * Start cloudflared detached so Nitro dev worker restarts do not tear it down.
 * Returns the child when a new process was started, or null if one is already running.
 */
export const startDevTunnel = (): ChildProcessWithoutNullStreams | null => {
    const existingPid = readPid()
    if (existingPid && isRunning(existingPid)) {
        logger.info("Tunnel", `Already running (PID ${existingPid})`)
        return null
    }

    if (existingPid) clearPid()

    const child = spawn("cloudflared", ["tunnel", "--config", ".cloudflared/config.yml", "run"], {
        cwd: process.cwd(),
        detached: true,
        stdio: ["ignore", "pipe", "pipe"]
    })

    writePid(child.pid!)
    child.unref()

    child.stdout.on("data", (data) => logger.info("Tunnel", data.toString().trim()))

    child.stderr.on("data", (data) => {
        const lines: string[] = data.toString().split("\n")
        for (const line of lines) {
            if (line.includes(" ERR ")) {
                logger.warn("Tunnel", line.trim())
            } else if (line.includes("Registered tunnel connection")) {
                logger.info("Tunnel", line.trim())
            }
        }
    })

    child.on("error", (err) => logger.error("Tunnel", err))

    child.on("close", (code) => {
        const pid = readPid()
        if (pid === child.pid) clearPid()
        logger.warn("Tunnel", `Closed with code ${code}`)
    })

    return child
}
