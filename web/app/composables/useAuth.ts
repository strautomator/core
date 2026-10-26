// Strautomator Web: Login and logout helpers

/**
 * Navigate to the specified OAuth action. Auth routes are server routes, so a full page load is needed.
 * @param action Login or logout.
 * @param redirectUrl Optional redirect URL after the action completes.
 */
const goToOAuth = (action: "login" | "logout", redirectUrl?: string) => {
    const url = `/auth/${action}?redirect-url=${encodeURIComponent(redirectUrl || "")}`
    return navigateTo(url, {external: true})
}

/**
 * Login and logout helpers.
 */
export const useAuth = () => {
    const route = useRoute()

    return {
        login: (redirectUrl?: string) => goToOAuth("login", redirectUrl ?? route.fullPath),
        logout: (redirectUrl?: string) => goToOAuth("logout", redirectUrl ?? route.fullPath)
    }
}
