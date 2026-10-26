// Strautomator Web: API fetcher composable

/**
 * Returns the $fetch instance used to call the Strautomator API,
 * which automatically sets the user's bearer token.
 */
export const useApi = () => useNuxtApp().$api
