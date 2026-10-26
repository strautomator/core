const core = require("./lib/index.js")

const dryRun = async () => {
    await core.startup(true)
    process.exit(0)
}

dryRun()
