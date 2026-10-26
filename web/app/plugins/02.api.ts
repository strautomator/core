// Strautomator Web: API fetcher with the user's bearer token

export default defineNuxtPlugin(() => {
    const store = useMainStore()
    const baseFetch = useRequestFetch()

    const api = baseFetch.create({
        onRequest({options}) {
            const token = store.oauth?.accessToken
            if (token) {
                const headers = new Headers(options.headers as HeadersInit)
                headers.set("Authorization", `Bearer ${token}`)
                options.headers = headers
            }
        }
    })

    return {
        provide: {api}
    }
})
