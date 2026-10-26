// Strautomator Web: Error handler that shows errors in the default layout dialog

/**
 * Returns a handler that parses the passed exception and sets the error details on the store.
 */
export const useWebError = () => {
    const store = useMainStore()

    return (method: string, ex: any): void => {
        try {
            const response = ex?.response
            const data = ex?.data ?? response?._data ?? null

            const getStatus = (obj: any) => obj?.status || obj?.statusCode || obj?.code
            let status = (data && typeof data == "object" ? getStatus(data) : null) || getStatus(response) || getStatus(ex)
            if (!status || isNaN(status)) {
                status = 500
            }

            let title = data && typeof data == "object" ? data.reason || data.title : ex?.reason || ex?.title
            if (!title) {
                if (status == 400) title = "Bad request"
                else if (status == 401 || status == 403) title = "Access denied"
                else if (status == 402) title = "Request not authorized"
                else if (status == 408) title = "Request timed out"
                else if (status == 429) title = "Too many requests"
                else if (status > 500) title = "Service not available"
                else title = "Something went wrong"
            }

            let message = data ? data.message || data.description || data.error || data : ex?.message || ex?.description || ex?.error || ex?.toString()
            if (message && typeof message != "string") {
                message = message.toString()
            }
            if (!message || message == "[object Object]") {
                if (status == 400) message = "The data sent to server could not be validate. If you're adding or updating details on your account, please double check the data and make sure it's valid."
                else if (status == 401 || status == 403) message = "You don't have the necessary permissions to access this resource. If you think this is a mistake, please login and try again."
                else if (status == 402) message = "The request was rejected by the server. You might need a PRO account to proceed."
                else if (status == 408) message = "The server or a 3rd party service did not respond in time. Please try again in a few minutes."
                else if (status == 429) message = "Your browser made too many requests to the server. Please give it some time, and try again."
                else if (status > 500) message = "The server or a 3rd party service is not available a the moment. Please try again in a few minutes."
                else message = "The server could not process your request, and there's no additional information available about the error, sorry."
            }

            if (import.meta.server) {
                console.error("webError", method, `Status ${status}`, `${title} - ${message}`)
                return
            }

            console.error(method, ex)

            if (typeof title != "string") title = String(title ?? "")
            if (title.endsWith(".")) {
                title = title.substring(0, title.length - 1)
            }
            if (!message.endsWith(".") && !message.endsWith("!")) {
                message = message + "."
            }

            store.setError({title: title, message: message, method: method})
        } catch (innerEx) {
            console.error("webError", method, ex, innerEx)
        }
    }
}
