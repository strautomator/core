// Strautomator Web: Production launcher
// Keeps the previous web server defaults: HTTPS on port 8443 if the strautomator.cert and
// strautomator.key files are present on the app root, otherwise HTTP on port 8080.
// The port can be overridden via the PORT environment variable.

import fs from "node:fs"

if (!process.env.NITRO_SSL_CERT && fs.existsSync("./strautomator.cert") && fs.existsSync("./strautomator.key")) {
    process.env.NITRO_SSL_CERT = fs.readFileSync("./strautomator.cert", "utf8")
    process.env.NITRO_SSL_KEY = fs.readFileSync("./strautomator.key", "utf8")
}
if (!process.env.PORT && !process.env.NITRO_PORT) {
    process.env.PORT = process.env.NITRO_SSL_CERT ? "8443" : "8080"
}

await import("./.output/server/index.mjs")
