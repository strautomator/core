// Strautomator Web: Browser cookie helpers (client only)

/**
 * Get a cookie value from the browser, or null if not found.
 * @param name Cookie name.
 */
export const getBrowserCookie = (name: string): string => {
    if (import.meta.server) return null
    const prefix = `${encodeURIComponent(name)}=`
    const cookie = document.cookie.split("; ").find((c) => c.startsWith(prefix))
    return cookie ? decodeURIComponent(cookie.substring(prefix.length)) : null
}

/**
 * Set a cookie on the browser.
 * @param name Cookie name.
 * @param value Cookie value.
 * @param maxAgeSeconds Max age in seconds.
 */
export const setBrowserCookie = (name: string, value: string | number | boolean, maxAgeSeconds: number): void => {
    if (import.meta.server) return
    document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value.toString())}; path=/; max-age=${maxAgeSeconds}; samesite=lax`
}
