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
