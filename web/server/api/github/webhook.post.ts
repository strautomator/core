// Strautomator API: GitHub webhook

import {github} from "strautomator-core"
import {defineEventHandler, getRequestHeader} from "nuxt/server"
import {Buffer} from "node:buffer"
import crypto from "node:crypto"
import {readRawBody, renderError, renderJson, toCoreRequest} from "../../utils/web"
import setmeup from "setmeup"
const settings = setmeup.settings

/**
 * Validate webhooks dispatched by GitHub.
 */
const validateWebhook = (body: any, rawBody: Buffer, sig256?: string, sigLegacy?: string): boolean => {
    const secret = settings.github.api.urlToken

    if (!secret) {
        throw new Error("Missing webhook secret")
    }
    if (!body || (!sig256 && !sigLegacy)) {
        throw new Error("Missing request body or headers")
    }
    if (!Buffer.isBuffer(rawBody)) {
        throw new Error("Missing raw request body")
    }

    const header = sig256 || sigLegacy
    const algorithm = sig256 ? "sha256" : "sha1"
    const prefix = `${algorithm}=`
    if (!header.startsWith(prefix)) {
        throw new Error("Invalid signature format")
    }

    const hmac = crypto.createHmac(algorithm, secret)
    const digest = Buffer.from(prefix + hmac.update(rawBody).digest("hex"), "utf8")
    const checksum = Buffer.from(header.toString(), "utf8")

    if (checksum.length != digest.length || !crypto.timingSafeEqual(digest, checksum)) {
        throw new Error("Request checksum invalid")
    }

    return true
}

/**
 * Webhooks posted by GitHub Sponsors.
 */
export default defineEventHandler(async (event) => {
    try {
        const rawBody = await readRawBody(event)
        let body: any = null
        if (rawBody.length > 0) {
            try {
                body = JSON.parse(rawBody.toString("utf8"))
            } catch {
                return renderError(event, "Invalid JSON", 400)
            }
        }
        const sig256 = getRequestHeader(event, "x-hub-signature-256")
        const sigLegacy = getRequestHeader(event, "x-hub-signature")

        try {
            validateWebhook(body, rawBody, sig256, sigLegacy)
        } catch (ex) {
            return renderError(event, ex, 401)
        }

        const req = toCoreRequest(event, body) as any
        req.rawBody = rawBody
        await github.processWebhook(req.body)
        return renderJson(event, {ok: true})
    } catch (ex) {
        return renderError(event, ex)
    }
})
