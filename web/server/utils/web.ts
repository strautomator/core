// Strautomator Web: Request and response helpers

import {getQuery, getRequestHeader, getRequestHeaders, getRequestIP, getRouterParam, getRouterParams, readBody, type RequestEvent} from "nuxt/server"
import {Buffer} from "node:buffer"
import _ from "lodash"
import logger from "anyhow"
import setmeup from "setmeup"
const settings = setmeup.settings

/**
 * Error with a predefined response status. Thrown by helpers like the requestValidator,
 * and rendered with the exact same semantics of renderError(event, error, status).
 */
export class WebError extends Error {
    /**
     * Create a new web error.
     * @param error The original error or message.
     * @param status The response status code.
     * @param response Optional custom response to be sent instead of the JSON error.
     */
    constructor(error: any, status?: number, response?: Response) {
        super(_.isString(error) ? error : error?.message || "Unknown error")
        this.error = error
        this.status = status
        this.response = response
    }

    /** The original error or message. */
    error: any
    /** Response status code. */
    status: number
    /** Custom response to be sent to the client. */
    response: Response
}

/**
 * Get the client IP, respecting the "trust proxy" setting (same semantics as Express).
 * @param event The request event.
 */
export const getClientIP = (event: RequestEvent): string => {
    if (event.context.clientIP) {
        return event.context.clientIP
    }

    const socketIP = getRequestIP(event) || ""
    const trustProxy = settings.app.trustProxy
    const forwarded = (getRequestHeader(event, "x-forwarded-for") || "")
        .split(",")
        .map((ip) => ip.trim())
        .filter((ip) => ip)
        .reverse()
    const addresses = [socketIP, ...forwarded]

    let ip = socketIP
    if (trustProxy === true) {
        ip = addresses[addresses.length - 1]
    } else if (_.isNumber(trustProxy) && trustProxy > 0) {
        ip = addresses[Math.min(trustProxy, addresses.length - 1)]
    }

    event.context.clientIP = ip
    return ip
}

/**
 * Read a required route parameter, throwing an error if missing.
 * @param event The request event.
 * @param name The route parameter name.
 * @param message Optional error message.
 */
export const getRequiredParam = (event: RequestEvent, name: string, message?: string): string => {
    const value = getRouterParam(event, name, {decode: true})
    if (!value) throw new Error(message || `Missing ${name}`)
    return value
}

/**
 * Validate the URL token passed as a route parameter (used by webhooks), throwing a 404 error if it doesn't match.
 * @param event The request event.
 * @param urlToken The expected URL token.
 */
export const validateUrlToken = (event: RequestEvent, urlToken: string): void => {
    const value = getRequiredParam(event, "urlToken", "Missing request params")
    if (value != urlToken) {
        throw Object.assign(new Error("Invalid URL token"), {status: 404})
    }
}

/**
 * Read the request body (cached, so it can be read multiple times and logged on errors).
 * GET and HEAD are skipped unless allowGet is set, because those methods normally have no body.
 * @param event The request event.
 * @param options.allowGet Also read the body of GET and HEAD requests.
 */
export const getBody = async <T = any>(event: RequestEvent, options?: {allowGet?: boolean}): Promise<T> => {
    if (!("requestBody" in event.context)) {
        const skipBody = !options?.allowGet && ["GET", "HEAD"].includes(event.req.method)
        event.context.requestBody = event.req.body && !skipBody ? await readBody(event) : undefined
    }
    return event.context.requestBody as T
}

/** Default raw body limit, matching body-parser's 100kb default. */
const defaultRawBodyLimit = 100 * 1024

/**
 * Read the raw request body, rejecting payloads over the limit (including chunked requests).
 * @param event The request event.
 * @param limit Maximum number of bytes, defaults to 100kb.
 */
export const readRawBody = async (event: RequestEvent, limit: number = defaultRawBodyLimit): Promise<Buffer> => {
    const declared = parseInt(getRequestHeader(event, "content-length") || "")
    if (Number.isFinite(declared) && declared > limit) {
        throw new WebError("Payload too large", 413)
    }

    if (!event.req.body) {
        return Buffer.alloc(0)
    }

    const reader = event.req.body.getReader()
    const chunks: Uint8Array[] = []
    let total = 0

    while (true) {
        const {done, value} = await reader.read()
        if (done) break
        total += value.byteLength
        if (total > limit) {
            await reader.cancel()
            throw new WebError("Payload too large", 413)
        }
        chunks.push(value)
    }

    return Buffer.concat(chunks)
}

/**
 * Return the passed data as JSON, adding the Access-Control-Allow-Origin header if set on the settings.
 * @param event The request event.
 * @param data The JSON data to be sent.
 * @param status Optional status code, defaults to 200.
 */
export const renderJson = (event: RequestEvent, data: any, status?: number): Response => {
    logger.debug("WebServer.renderJson", event.url.pathname, data)

    if (_.isString(data)) {
        try {
            data = JSON.parse(data)
        } catch (ex) {
            logger.error("WebServer.renderJson", ex)
            return renderError(event, ex)
        }
    }

    return new Response(JSON.stringify(data === undefined ? null : data), {status: status || 200, headers: jsonHeaders()})
}

/**
 * Returns a JSON error response.
 * @param event The request event.
 * @param error The error object or message to be sent to the client.
 * @param status The response status code, optional, default is 500.
 */
export const renderError = (event: RequestEvent, error: any, status?: number | string): Response => {
    const method = event.req.method
    const path = event.url.pathname + event.url.search
    const ip = getClientIP(event)
    let message: any

    // Unwrap web errors.
    if (error instanceof WebError) {
        if (error.response) {
            return error.response
        }
        if (status == null) {
            status = error.status
        }
        error = error.error
    }

    // Default statuses.
    if (status == null) {
        status = error?.statusCode || error?.status || error?.code
    }
    if (status == "ECONNRESET" || status == "ECONNABORTED" || status == "ETIMEDOUT") {
        status = 408
    }

    const body = event.context.requestBody
    if (_.isNil(error)) {
        error = "Unknown error"
        logger.warn("Routes", method, path, "Called with empty error", `From ${ip}`)
    } else if (["POST", "PUT", "PATCH"].includes(method) && body) {
        logger.error("Routes", method, path, error, `Body: ${JSON.stringify(body, null, 0)}`, `From ${ip}`)
    } else {
        logger.error("Routes", method, path, error, `From ${ip}`)
    }

    // Error defaults to 500 if not a valid number.
    if (!_.isNumber(status)) {
        status = 500
    }

    try {
        // Error inside another .error property?
        if (error.error && !error.message && !error.error_description && !error.reason) {
            error = error.error
        }

        if (_.isString(error)) {
            message = {message: error}
        } else {
            message = {}
            message.message = error.message || error.error_description || error.description

            // No message found? Just use the default .toString() then.
            if (!message.message) {
                message.message = error.toString()
            }

            if (error.friendlyMessage) {
                message.friendlyMessage = error.friendlyMessage
            }
            if (error.reason) {
                message.reason = error.reason
            }
            if (error.code) {
                message.code = error.code
            } else if (error.status) {
                message.code = error.status
            }
        }
    } catch (ex) {
        logger.error("WebServer.renderError", error, ex)
    }

    return new Response(JSON.stringify(message), {status: status as number, headers: jsonHeaders()})
}

/**
 * Default headers for JSON responses.
 */
const jsonHeaders = (): Headers => {
    const headers = new Headers({"Content-Type": "application/json; charset=utf-8"})
    if (settings.app.allowOriginHeader) {
        headers.set("Access-Control-Allow-Origin", settings.app.allowOriginHeader)
    }
    return headers
}

/**
 * Express-like request object, to be passed to core methods that expect an Express request.
 */
export interface CoreRequest {
    method: string
    url: string
    originalUrl: string
    path: string
    params: Record<string, string>
    query: Record<string, any>
    headers: Record<string, string>
    body: any
    ip: string
    socket: {remoteAddress: string}
    connection: {remoteAddress: string}
}

/**
 * Create an Express-like request object from the event, for core methods that
 * expect an Express request (webhooks, OAuth callbacks, etc).
 * @param event The request event.
 * @param body Optional body (otherwise the cached request body is used).
 */
export const toCoreRequest = (event: RequestEvent, body?: any): CoreRequest => {
    const ip = getClientIP(event)
    return {
        method: event.req.method,
        url: event.url.pathname + event.url.search,
        originalUrl: event.url.pathname + event.url.search,
        path: event.url.pathname,
        params: getRouterParams(event, {decode: true}) || {},
        query: getQuery(event),
        headers: getRequestHeaders(event),
        body: body !== undefined ? body : event.context.requestBody,
        ip: ip,
        socket: {remoteAddress: ip},
        connection: {remoteAddress: ip}
    }
}

/**
 * Express-like response writer, backed by a ReadableStream, for core methods
 * that stream data by calling res.write() and res.end().
 */
export const createStreamWriter = () => {
    const encoder = new TextEncoder()
    let controller: ReadableStreamDefaultController<Uint8Array>
    let ended = false

    const stream = new ReadableStream<Uint8Array>({
        start(c) {
            controller = c
        },
        cancel() {
            ended = true
        }
    })

    const writer = {
        headersSent: false,
        writableEnded: false,
        setHeader: () => writer,
        status: () => writer,
        write: (chunk: any) => {
            if (ended) return false
            writer.headersSent = true
            controller.enqueue(typeof chunk == "string" ? encoder.encode(chunk) : chunk)
            return true
        },
        end: (chunk?: any) => {
            if (ended) return
            if (chunk) writer.write(chunk)
            ended = true
            writer.writableEnded = true
            controller.close()
        }
    }

    return {stream, writer}
}

declare module "nuxt/schema" {
    interface RequestEventContext {
        /** Client IP (cached). */
        clientIP?: string
        /** Request body (cached). */
        requestBody?: any
    }
}
