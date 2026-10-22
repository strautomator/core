// Strautomator Web: Current user helpers

let refreshPromise: Promise<void> = null

/**
 * Current user state and helpers. When used inside a component, the user details
 * are automatically refreshed on mount if older than 10 minutes.
 */
export const useUser = () => {
    const store = useMainStore()
    const api = useApi()

    const user = computed(() => store.user)

    const getMaxFor = (field: string): number => (store.user?.isPro ? store.proPlanDetails[field] : store.freePlanDetails[field])

    const distanceUnits = computed(() => {
        if (!store.user) return ""
        return store.user.profile.units == "imperial" ? "mi" : "km"
    })

    const recipesMaxAllowed = computed(() => getMaxFor("maxRecipes"))

    const recipesRemaining = computed(() => {
        if (!store.user) return store.freePlanDetails.maxRecipes
        const remaining = getMaxFor("maxRecipes") - Object.keys(store.user.recipes || {}).length

        // At the moment only 2 plans, and PRO should have unlimited.
        return store.user.isPro && remaining < 1 ? 1 : remaining
    })

    const gearwearMaxAllowed = computed(() => getMaxFor("maxGearWear"))

    /**
     * Get how many GearWear configurations can still be created.
     * @param gearwearConfigs Current GearWear configurations (object or array).
     */
    const getGearwearRemaining = (gearwearConfigs: any): number => {
        if (!store.user || !gearwearConfigs) return store.freePlanDetails.maxGearWear
        const remaining = getMaxFor("maxGearWear") - Object.keys(gearwearConfigs).length

        // At the moment only 2 plans, and PRO should have unlimited.
        return store.user.isPro && remaining < 1 ? 1 : remaining
    }

    const isPrivacyMode = computed(() => store.user?.preferences?.privacyMode)

    /**
     * Fetch the latest user details from the API.
     */
    const refreshUser = async (): Promise<void> => {
        if (!store.user) return
        if (!refreshPromise) {
            refreshPromise = (async () => {
                try {
                    const data = await api(`/api/users/${store.user.id}`, {query: {refresh: 1}})
                    store.setLastUserFetch(new Date().valueOf())
                    store.setUser(data)
                } finally {
                    refreshPromise = null
                }
            })()
        }
        await refreshPromise
    }

    /**
     * Refresh the user details if older than 10 minutes.
     */
    const refreshUserIfStale = async (): Promise<void> => {
        if (!store.oauth?.accessToken || !store.user) return
        const minTimestamp = new Date().valueOf() - 600000
        if (!store.lastUserFetch || store.lastUserFetch < minTimestamp) {
            try {
                await refreshUser()
            } catch (ex) {
                console.error("useUser.refreshUserIfStale", ex)
            }
        }
    }

    if (getCurrentInstance()) {
        onMounted(refreshUserIfStale)
    }

    return {user, distanceUnits, recipesMaxAllowed, recipesRemaining, gearwearMaxAllowed, getGearwearRemaining, isPrivacyMode, refreshUser, refreshUserIfStale}
}
