// MCP OAuth registration checks (run with: npx tsx server/mcp/oauth.spec.ts)

import path from "path"
import {fileURLToPath} from "url"
import logger from "anyhow"
import setmeup from "setmeup"
import store from "./store"
import {registerClient} from "./oauth"
import {getMcpConfig} from "./utils"

const settingsFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../core/settings.json")
setmeup.load(settingsFile)

let failed = 0
const warnings: string[] = []
const originalWarn = logger.warn.bind(logger)
logger.warn = ((...args: any[]) => {
    warnings.push(args.map((arg) => (arg == null ? "" : String(arg))).join(" "))
    return originalWarn(...args)
}) as typeof logger.warn

const assert = (cond: any, message: string) => {
    if (!cond) {
        failed++
        console.error(`FAIL: ${message}`)
    } else {
        console.log(`ok: ${message}`)
    }
}

// Gemini's consumer web app registers these six Google redirect URIs (Connected Apps docs:
// oauth-redirect, oauth-redirect-sandbox and oauth-redirect-test, each with /r and /a).
const geminiRedirectUris = [
    "https://oauth-redirect.googleusercontent.com/r/user_bound_custom-mcp-strautomator",
    "https://oauth-redirect.googleusercontent.com/a/user_bound_custom-mcp-strautomator",
    "https://oauth-redirect-sandbox.googleusercontent.com/r/user_bound_custom-mcp-strautomator",
    "https://oauth-redirect-sandbox.googleusercontent.com/a/user_bound_custom-mcp-strautomator",
    "https://oauth-redirect-test.googleusercontent.com/r/user_bound_custom-mcp-strautomator",
    "https://oauth-redirect-test.googleusercontent.com/a/user_bound_custom-mcp-strautomator"
]

const secretInBody = "super-secret-client-value"
const secretInUserinfo = "super-secret-userinfo"

let savedClient: any = null
store.saveClient = async (client) => {
    savedClient = client
}

const registrationEvent = (body: any, ip: string) => {
    return {
        context: {clientIP: ip, requestBody: body},
        req: {method: "POST", headers: new Headers()},
        url: new URL("https://strautomator.com/mcp/oauth/register"),
        res: {headers: new Headers()}
    } as any
}

const maxRedirectUris = getMcpConfig().maxRedirectUris
assert(maxRedirectUris >= geminiRedirectUris.length, `configured redirect URI cap (${maxRedirectUris}) covers Gemini's ${geminiRedirectUris.length}`)

warnings.length = 0
savedClient = null
const geminiResponse = await registerClient(
    registrationEvent(
        {
            client_name: "Google",
            client_secret: secretInBody,
            redirect_uris: geminiRedirectUris,
            grant_types: ["authorization_code", "refresh_token"],
            response_types: ["code"],
            token_endpoint_auth_method: "none"
        },
        "203.0.113.10"
    )
)
const geminiBody = await geminiResponse.json()
assert(geminiResponse.status == 201, `Gemini registration status ${geminiResponse.status}`)
assert(Array.isArray(geminiBody.redirect_uris) && geminiBody.redirect_uris.length == geminiRedirectUris.length, "Gemini registration keeps all 6 redirect URIs")
assert(
    geminiRedirectUris.every((uri) => geminiBody.redirect_uris.includes(uri)),
    "Gemini registration echoes each Google redirect URI"
)
assert(geminiBody.client_id && geminiBody.token_endpoint_auth_method == "none" && !geminiBody.client_secret, "Gemini registration is a public client")
assert(savedClient?.redirectUris?.length == geminiRedirectUris.length, "Gemini client is stored with 6 redirect URIs")
assert(!warnings.some((line) => line.includes("MCP.registerClient") && line.includes("invalid_redirect_uri")), "successful Gemini registration is not logged as a rejection")

warnings.length = 0
const tooManyUris = [...geminiRedirectUris, `https://user:${secretInUserinfo}@evil.example/callback?access_token=${secretInBody}`, "https://oauth-redirect.googleusercontent.com/r/extra-1", "https://oauth-redirect.googleusercontent.com/r/extra-2"]
const rejected = await registerClient(
    registrationEvent(
        {
            client_name: "Google",
            client_secret: secretInBody,
            redirect_uris: tooManyUris
        },
        "203.0.113.11"
    )
)
const rejectedBody = await rejected.json()
assert(tooManyUris.length > maxRedirectUris, "rejection fixture exceeds the cap")
assert(rejected.status == 400 && rejectedBody.error == "invalid_redirect_uri" && rejectedBody.error_description == "Too many redirect_uris", "registrations over the cap are still rejected")
const rejectionLog = warnings.find((line) => line.includes("Too many redirect_uris"))
assert(!!rejectionLog, "rejected registration is logged")
assert(rejectionLog?.includes(`${tooManyUris.length} redirect URIs`), "rejection log includes the redirect URI count")
assert(rejectionLog?.includes("https://oauth-redirect.googleusercontent.com"), "rejection log includes the redirect host")
assert(!rejectionLog?.includes(secretInBody) && !rejectionLog?.includes(secretInUserinfo), "rejection log omits secrets from the body and the redirect URI")
assert(!warnings.some((line) => line.includes(secretInBody) || line.includes(secretInUserinfo)), "no registration log line contains the planted secrets")

if (failed > 0) {
    console.error(`${failed} assertion(s) failed`)
    process.exit(1)
}

console.log("All MCP OAuth registration checks passed")
