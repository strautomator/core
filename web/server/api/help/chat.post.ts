// Strautomator API: Help chat

import {chatbase} from "strautomator-core"
import {defineEventHandler} from "nuxt/server"
import {requestValidator} from "../../utils/auth"
import {createStreamWriter, getBody, renderError} from "../../utils/web"
import logger from "anyhow"

/**
 * Ask the Chatbase AI bot.
 */
export default defineEventHandler(async (event) => {
    try {
        const body = await getBody(event)
        if (!body?.message) throw new Error("Missing request body")

        const user = await requestValidator(event, {anonymous: true, referer: true})
        const {stream, writer} = createStreamWriter()
        let settled = false
        let failure: any = null

        // Return as soon as the first chunk is written so the client can read the answer
        // while generation continues. Failures before any output stay on the HTTP response.
        const ready = new Promise<void>((resolve) => {
            const write = writer.write.bind(writer)
            writer.write = (chunk: any) => {
                const result = write(chunk)
                if (!settled) {
                    settled = true
                    resolve()
                }
                return result
            }

            chatbase.getAnswer(user as any, body.message.trim(), writer as any).then(
                () => {
                    if (!settled) {
                        settled = true
                        resolve()
                    }
                },
                (ex) => {
                    if (!settled) {
                        settled = true
                        failure = ex
                        resolve()
                    } else if (!writer.writableEnded) {
                        logger.error("Routes.help", event.req.method, event.url.pathname + event.url.search, ex)
                        writer.end()
                    }
                }
            )
        })

        await ready
        if (failure) return renderError(event, failure)
        return new Response(stream, {headers: {"Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache"}})
    } catch (ex) {
        return renderError(event, ex)
    }
})
