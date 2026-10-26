// Strautomator API: Heartbeat

import {defineEventHandler} from "nuxt/server"
import {renderJson} from "../utils/web"
import packageJson from "../../package.json"

/**
 * Heartbeat data.
 */
export default defineEventHandler((event) => {
    return renderJson(event, {version: packageJson.version})
})
