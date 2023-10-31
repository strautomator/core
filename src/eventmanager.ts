// Strautomator Core: Event Manager

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
    emit(eventName: string | symbol, ...args: any[]): boolean {
        const details = []
        for (let arg of args) {
            if (typeof arg === "string" || typeof arg === "number" || typeof arg === "boolean") {
                details.push(arg)
            } else {
                if (arg["id"]) details.push(arg["id"])
                if (arg["userId"]) details.push(arg["userId"])
                if (arg["displayName"]) details.push(arg["displayName"])
            }
        }

        logger.info("EventManager.emit", eventName, details.join(" "))
        return super.emit(eventName, ...args)
    }
}

// Exports...
export default EventManager.Instance
