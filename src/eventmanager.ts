// Strautomator Core: Event Manager

import events = require("events")

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
}

// Exports...
export default EventManager.Instance
