// Strautomator Web: Populate the store with the initial state from the server

export default defineNuxtPlugin(() => {
    const event = useRequestEvent()
    const appInit = event?.context?.appInit

    if (appInit) {
        useMainStore().init(appInit)
    }
})
