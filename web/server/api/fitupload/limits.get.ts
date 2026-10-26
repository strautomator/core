// Strautomator API: FIT upload limits

import {defineEventHandler} from "nuxt/server"
import {renderError, renderJson} from "../../utils/web"
import setmeup from "setmeup"
const settings = setmeup.settings

/**
 * Get the limits that apply to the uploaded archives.
 */
export default defineEventHandler((event) => {
    try {
        const upload = settings.fitparser.upload
        return renderJson(event, {maxSize: upload.maxSize, maxFiles: settings.fitparser.maxFiles, maxFileSize: upload.maxFileSize, maxExpandedSize: upload.maxExpandedSize})
    } catch (ex) {
        return renderError(event, ex)
    }
})
