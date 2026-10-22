// Strautomator Web: Local storage helpers with expiration

/**
 * Get data from the local storage, or null if not found or expired.
 * @param key The storage key.
 */
export const getLocalStorage = (key: string): any => {
    try {
        if (import.meta.server) {
            return null
        }

        const itemJson = window.localStorage.getItem(key)
        if (!itemJson) {
            return null
        }

        const item = JSON.parse(itemJson)
        if (!item || (item.expires && item.expires < Math.round(new Date().valueOf() / 1000))) {
            return null
        }

        return item.data
    } catch (ex) {
        console.error("getLocalStorage", key, ex)
        return null
    }
}

/**
 * Save data to the local storage, with an optional max age.
 * @param key The storage key.
 * @param data Data to be saved.
 * @param maxAgeSeconds Optional max age in seconds.
 */
export const setLocalStorage = (key: string, data: any, maxAgeSeconds?: number): void => {
    try {
        if (import.meta.server) {
            return
        }

        const item: any = {data: data}

        if (maxAgeSeconds) {
            item.expires = Math.round(new Date().valueOf() / 1000) + maxAgeSeconds
        }

        window.localStorage.setItem(key, JSON.stringify(item, null, 0))
    } catch (ex) {
        console.error("setLocalStorage", key, ex)
    }
}
