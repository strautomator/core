// Strautomator Web: Pages using the default layout require an authenticated user

export default defineNuxtRouteMiddleware((to) => {
    const layout = to.meta.layout || "default"
    if (layout != "default" || to.matched.length == 0) {
        return
    }

    const store = useMainStore()
    if (!store.isLoggedIn) {
        return navigateTo(`/auth/login?redirect-url=${encodeURIComponent(to.fullPath)}`, {external: true, redirectCode: 302})
    }
})
