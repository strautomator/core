// Strautomator Core: HTTP types

/**
 * Minimal HTTP request, with the fields used by the webhook and OAuth handlers.
 */
export interface HttpRequest {
    /** Parsed request body. */
    body?: any
    /** Request headers (lowercased). */
    headers: {[header: string]: string | string[] | undefined}
    /** Query string parameters. */
    query: {[param: string]: any}
    /** Client IP address, used when the cf-connecting-ip header is missing. */
    ip?: string
}

/**
 * Minimal writable HTTP response, used to stream data back to the client.
 */
export interface HttpResponseWriter {
    /** Write a chunk of data. */
    write: (chunk: any) => any
    /** End the response. */
    end: () => any
}

/**
 * Get the client IP from the Cloudflare header, falling back to the request IP.
 * Returns an empty string if the IP is unknown.
 * @param req The HTTP request.
 */
export const getRequestIP = (req: HttpRequest): string => {
    const ip = req.headers["cf-connecting-ip"] || req.ip
    return ip ? ip.toString() : ""
}
