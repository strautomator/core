// Strautomator Web: Wait for the startup to complete

import {defineEventHandler} from "nuxt/server"
import {coreStartup} from "../utils/startup"

/**
 * Make sure the core has started before processing requests.
 */
export default defineEventHandler(async () => {
    await coreStartup()
})
