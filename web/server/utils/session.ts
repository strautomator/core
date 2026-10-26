// Strautomator Web: Session cookies
// Encrypted session cookies, using the same format as the "client-sessions" library
// previously used with Express, so existing sessions remain valid after the migration.

import {getCookie, setCookie, type RequestEvent} from "nuxt/server"
import crypto from "node:crypto"
import setmeup from "setmeup"
const settings = setmeup.settings

/** Session duration (7 days). */
const SESSION_DURATION = 7 * 24 * 60 * 60 * 1000

/** Sessions about to expire within this period will be extended. */
const ACTIVE_DURATION = 5 * 60 * 1000

/**
 * Session content stored on the cookie.
 */
export interface SessionContent {
    /** Strava tokens. */
    token?: {
        accessToken?: string
        refreshToken?: string
        expiresAt?: number
    }
    /** Logged user ID. */
    userId?: string
}

/**
 * A loaded session.
 */
export interface WebSession {
    /** Session content. */
    content: SessionContent
    /** Creation timestamp. */
    createdAt: number
    /** Duration in milliseconds. */
    duration: number
    /** Original JSON (to detect changes). */
    json: string
    /** Flagged as dirty (cookie must be rewritten). */
    dirty: boolean
}

/**
 * Encode a buffer as base64url without padding.
 * @param buf The buffer to be encoded.
 */
const base64urlEncode = (buf: Buffer): string => {
    return buf.toString("base64").split("=")[0].replace(/\+/g, "-").replace(/\//g, "_")
}

/**
 * Decode a base64url string into a buffer.
 * @param value The base64url string.
 */
const base64urlDecode = (value: string): Buffer => {
    let s = value.replace(/-/g, "+").replace(/_/g, "/")
    const mod = s.length % 4
    if (mod == 2) s += "=="
    else if (mod == 3) s += "="
    else if (mod == 1) throw new Error("Illegal base64url string")
    return Buffer.from(s, "base64")
}

/**
 * Derive the encryption and signature keys from the cookie secret.
 */
const getKeys = (): {encryptionKey: Buffer; signatureKey: Buffer} => {
    const secret = settings.cookie.secret
    return {
        encryptionKey: crypto.createHmac("sha256", secret).update("cookiesession-encryption").digest(),
        signatureKey: crypto.createHmac("sha256", secret).update("cookiesession-signature").digest()
    }
}

/**
 * Compute the HMAC signature of the cookie components.
 */
const computeHmac = (signatureKey: Buffer, iv: Buffer, ciphertext: Buffer, duration: number, createdAt: number): Buffer => {
    const hmac = crypto.createHmac("sha256", signatureKey)
    hmac.update(iv)
    hmac.update(".")
    hmac.update(ciphertext)
    hmac.update(".")
    hmac.update(createdAt.toString())
    hmac.update(".")
    hmac.update(duration.toString())
    return hmac.digest()
}

/**
 * Encode the session content into a cookie value.
 * @param content Session content.
 * @param duration Session duration in milliseconds.
 * @param createdAt Session creation timestamp.
 */
export const encodeSession = (content: SessionContent, duration: number, createdAt: number): string => {
    const cookieName = settings.cookie.sessionName
    const {encryptionKey, signatureKey} = getKeys()
    const iv = crypto.randomBytes(16)
    const plaintext = Buffer.from(`${cookieName}=${JSON.stringify(content)}`, "utf8")
    const cipher = crypto.createCipheriv("aes256", encryptionKey, iv)
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
    const hmac = computeHmac(signatureKey, iv, ciphertext, duration, createdAt)

    return [base64urlEncode(iv), base64urlEncode(ciphertext), createdAt, duration, base64urlEncode(hmac)].join(".")
}

/**
 * Decode a session cookie value. Returns null if invalid.
 * @param value The cookie value.
 */
export const decodeSession = (value: string): {content: SessionContent; createdAt: number; duration: number} => {
    const cookieName = settings.cookie.sessionName
    const components = value.split(".")
    if (components.length !== 5) {
        return null
    }

    try {
        const {encryptionKey, signatureKey} = getKeys()
        const iv = base64urlDecode(components[0])
        const ciphertext = base64urlDecode(components[1])
        const hmac = base64urlDecode(components[4])
        const createdAt = parseInt(components[2], 10)
        const duration = parseInt(components[3], 10)

        if (iv.length !== 16) {
            return null
        }

        const expectedHmac = computeHmac(signatureKey, iv, ciphertext, duration, createdAt)
        if (hmac.length !== expectedHmac.length || !crypto.timingSafeEqual(hmac, expectedHmac)) {
            return null
        }

        const decipher = crypto.createDecipheriv("aes256", encryptionKey, iv)
        const plaintext = decipher.update(ciphertext, undefined, "utf8") + decipher.final("utf8")
        const sepIndex = plaintext.indexOf("=")
        if (plaintext.substring(0, sepIndex) !== cookieName) {
            return null
        }

        return {content: JSON.parse(plaintext.substring(sepIndex + 1)), createdAt, duration}
    } catch (ex) {
        return null
    }
}

/**
 * Load the session for the passed event (cached on the event context).
 * @param event The request event.
 */
export const loadSession = (event: RequestEvent): WebSession => {
    if (event.context.webSession) {
        return event.context.webSession
    }

    const now = Date.now()
    const session: WebSession = {content: {}, createdAt: now, duration: SESSION_DURATION, json: "{}", dirty: false}
    const cookie = getCookie(event, settings.cookie.sessionName)
    const decoded = cookie ? decodeSession(cookie) : null

    if (decoded) {
        session.content = decoded.content || {}
        session.createdAt = decoded.createdAt
        session.duration = decoded.duration

        const expiresAt = session.createdAt + session.duration
        if (expiresAt < now) {
            resetSession(session)
        } else if (expiresAt - now < ACTIVE_DURATION) {
            session.createdAt += ACTIVE_DURATION
            session.dirty = true
        }
    }

    session.json = JSON.stringify(session.content)
    event.context.webSession = session
    return session
}

/**
 * Reset the session content.
 * @param session The session to be reset.
 * @param duration Optional new duration, defaults to 7 days.
 */
export const resetSession = (session: WebSession, duration?: number): void => {
    session.content = {}
    session.createdAt = Date.now()
    session.duration = duration ?? SESSION_DURATION
    session.dirty = true
}

/**
 * Write the session cookie, only if the session has changed.
 * @param event The request event.
 */
export const commitSession = (event: RequestEvent): void => {
    const session: WebSession = event.context.webSession
    if (!session) {
        return
    }
    if (!session.dirty && session.json === JSON.stringify(session.content)) {
        return
    }

    const value = encodeSession(session.content, session.duration, session.createdAt)
    setCookie(event, settings.cookie.sessionName, value, {httpOnly: true, path: "/", expires: new Date(session.createdAt + session.duration + 1000)})

    session.json = JSON.stringify(session.content)
    session.dirty = false
}

declare module "nuxt/schema" {
    interface RequestEventContext {
        /** Loaded session. */
        webSession?: WebSession
        /** OAuth state passed to the Nuxt app. */
        oauth?: {userId?: string; accessToken?: string}
    }
}
