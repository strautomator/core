// Strautomator Core: Event Manager

import _ from "lodash"
import events from "events"
import logger from "anyhow"

/**
 * Central event manager.
 */
export class EventManager extends events.EventEmitter {
    private static _instance: EventManager
    static get Instance(): EventManager {
        if (!this._instance) {
            this._instance = new this()
            this._instance.setMaxListeners(20)
        }

        return this._instance
    }

    /**
     * Emits an event.
     * @param eventName The event name.
     * @param args Event args.
     */
    emit(eventName: string, ...args: any[]): boolean {
        const isTokenEvent = eventName.toLowerCase().includes("token")

        // Build the log details depending on argument types and data.
        const details = []
        for (let arg of args) {
            if (arg === null) continue
            if (typeof arg === "string") {
                if (isTokenEvent && !arg.includes(" ") && ((arg.length > 36 && arg.length < 44) || (arg.split("\\.").length == 3 && arg.length > 32))) {
                    details.push(`${arg.substring(0, 2)}*${arg.substring(-2)}`)
                } else {
                    details.push(arg)
                }
            } else if (typeof arg === "number" || typeof arg === "boolean" || _.isDate(arg)) {
                details.push(arg)
            } else {
                if (arg["id"]) details.push(arg["id"])
                if (arg["userId"]) details.push(arg["userId"])
                if (arg["displayName"]) details.push(arg["displayName"])
            }
        }

        logger.info("EventManager.emit", eventName, details.length > 0 ? details.join(" ") : "no args")
        return super.emit(eventName, ...args)
    }
}

// Exports...
export default EventManager.Instance
