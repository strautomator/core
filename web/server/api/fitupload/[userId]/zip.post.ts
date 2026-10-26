// Strautomator API: FIT ZIP upload

import {fitparser} from "strautomator-core"
import type {FitUploadResult} from "strautomator-core"
import {defineEventHandler, getRequestHeader} from "nuxt/server"
import {Readable} from "node:stream"
import {requestValidator} from "../../../utils/auth"
import {renderError} from "../../../utils/web"
import setmeup from "setmeup"
const settings = setmeup.settings

/**
 * Upload a ZIP archive with FIT files to be processed.
 */
export default defineEventHandler(async (event) => {
    try {
        const user = await requestValidator(event)
        if (!user.isPro) {
            return renderError(event, "Uploading FIT files is available to PRO users only", 402)
        }

        const maxSize = settings.fitparser.upload.maxSize
        const contentLength = parseInt(getRequestHeader(event, "content-length") as string) || 0
        if (contentLength > maxSize) {
            return renderError(event, `The archive is bigger than ${Math.round(maxSize / 1024 / 1024)}MB`, 413)
        }

        const zipStream = event.req.body ? Readable.fromWeb(event.req.body as any) : Readable.from([])
        const encoder = new TextEncoder()
        const stream = new ReadableStream<Uint8Array>({
            async start(controller) {
                const write = async (data: any) =>
                    controller.enqueue(
                        encoder.encode(`${JSON.stringify(data)}
`)
                    )

                try {
                    const callbacks = {
                        onStart: async (total: number) => await write({type: "start", total: total}),
                        onFile: async (result: FitUploadResult) => await write({type: "file", result: result})
                    }
                    const results = await fitparser.upload.processZip(user, zipStream, callbacks, contentLength)

                    await write({type: "end", results: results})
                    controller.close()
                } catch (ex) {
                    await write({type: "error", message: ex.message || ex.toString()})
                    controller.close()
                }
            }
        })

        return new Response(stream, {status: 200, headers: {"Content-Type": "application/x-ndjson", "Cache-Control": "no-store", "X-Accel-Buffering": "no"}})
    } catch (ex) {
        return renderError(event, ex)
    }
})
