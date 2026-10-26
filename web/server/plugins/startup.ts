// Strautomator Web: Startup plugin

import {definePlugin} from "nitro"
import {coreStartup} from "../utils/startup"

/**
 * Start the Strautomator core as soon as the server starts. Requests will
 * wait for the startup to complete (see middleware/01.startup.ts).
 */
export default definePlugin(() => {
    coreStartup()
})
