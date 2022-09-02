// Strautomator Core: GitHub

import {GitHubChangelog, GitHubSubscription} from "./types"
import {axiosRequest} from "../axios"
import database from "../database"
import dayjs from "../dayjs"
import eventManager from "../eventmanager"
import users from "../users"
import _ = require("lodash")
import logger = require("anyhow")
const settings = require("setmeup").settings
const packageVersion = require("../../package.json").version

/**
 * GitHub Manager.
 */
export class GitHub {
    private constructor() {}
    private static _instance: GitHub
    static get Instance() {
        return this._instance || (this._instance = new this())
    }

    // INIT
    // --------------------------------------------------------------------------

    /**
     * Init the GitHub wrapper.
     * @param quickStart If true, will not get the changelog from the repo releases.
     */
    init = async (quickStart?: boolean): Promise<void> => {
        try {
            if (!quickStart) {
                await this.buildChangelog()
            }
        } catch (ex) {
            logger.error("GitHub.init", ex)
            throw ex
        }
    }

    /**
     * Make a request to the GitHub API with the given options.
     * @param method Request method.
     * @param path API path.
     * @param body Optional body.
     */
    private makeRequest = async (method: "GET" | "POST", path: string, body?: any): Promise<any> => {
        const options: any = {headers: {}, returnResponse: true}

        // Request options.
        options.method = method
        options.url = `${settings.github.api.baseUrl}${path}`
        options.headers["Authorization"] = `Bearer ${settings.github.api.token}`
        options.headers["User-Agent"] = `${settings.app.title} / ${packageVersion}`

        // Optional body.
        if (body) {
            options.body = body
        }

        try {
            let result = []

            // Follow pagination.
            while (options.url) {
                const res = await axiosRequest(options)
                logger.debug("GitHub.makeRequest", method, options.url)

                options.url = null

                if (res.data && _.isArray(res.data) && res.headers && res.headers["link"]) {
                    const links = res.headers["link"].split(", ")

                    for (let link of links) {
                        if (link.includes(`rel="next"`)) {
                            options.url = link.substring(1, link.indexOf(">"))
                            break
                        }
                    }

                    result = result.concat(res.data)
                } else if (result.length == 0) {
                    result = res.data
                }
            }

            return result
        } catch (ex) {
            logger.error("GitHub.makeRequest", method, options.url, ex)
            throw ex
        }
    }

    // MAIN METHODS
    // --------------------------------------------------------------------------

    /**
     * Get the releases from the repository on GitHub.
     */
    getRepoReleases = async (): Promise<any[]> => {
        try {
            const reqPath = `repos/${settings.github.api.repo}/releases?per_page=100`
            const result = await this.makeRequest("GET", reqPath)

            return result
        } catch (ex) {
            logger.error("GitHub.getRepoReleases", ex)
            throw ex
        }
    }

    // CHANGELOG
    // --------------------------------------------------------------------------

    /**
     * Build the application change log based on the repo releases.
     */
    buildChangelog = async (): Promise<void> => {
        try {
            const releases = await this.getRepoReleases()
            const changelog: GitHubChangelog = {}
            let relevReleases: number = 0

            for (let rel of releases) {
                const body = rel.body.split("\n")
                const updates = body.filter((b) => !b.includes("Updated dependencies") && !b.includes("Maintenance release") && !b.includes("Redeployment"))

                if (updates.length > 0) {
                    relevReleases++

                    changelog[rel.tag_name] = {
                        changes: updates,
                        datePublished: dayjs(rel.created_at).toDate()
                    }
                }
            }

            logger.info("GitHub.buildChangelog", `${releases.length} total, ${relevReleases} relevant releases`, `Last: ${releases[0].tag_name}`)

            await database.appState.set("changelog", changelog, true)
        } catch (ex) {
            logger.error("GitHub.buildChangelog", ex)
        }
    }

    // WEBHOOKS
    // --------------------------------------------------------------------------

    /**
     * Process a webhook event dispatched by GitHub.
     * @param data Event data.
     * @event GitHub.subscriptionUpdated
     */
    processWebhook = async (data: any): Promise<void> => {
        const details = []

        try {
            if (!data) {
                details.push(data.event_type)
                logger.warn("GitHub.processWebhook", "Missing webhook body")
                return
            }

            const now = new Date()

            // Log request body.
            if (data.action) details.push(`Action: ${data.action}`)
            if (data.sender) details.push(`Sender: ${data.sender.login}`)
            if (data.hook) details.push(`Hook: ${data.hook.type}`)
            if (data.sponsorship) {
                details.push(`Sponsor: ${data.sponsorship.sponsor.login}`)
                details.push(`Tier: ${data.sponsorship.tier.name}`)
                details.push(`Amount: ${data.sponsorship.tier.monthly_price_in_dollars} USD`)
            }

            // Abort here if sponsorship webhook is missing crutial data.
            if (!data.action || !data.sponsorship) {
                logger.warn("GitHub.processWebhook", "Missing sponsorship details", details.join(", "))
                return
            }

            const username = data.sponsorship.sponsor.login
            const subId = `GH-${username}`

            // Check if the subscription data already exists, and if not, create one.
            let subscription: GitHubSubscription = await database.get("subscriptions", subId)
            if (!subscription) {
                const user = await users.getByUsername(username)

                // Can't create subscription if a user with a similar username was not found.
                if (!user) {
                    logger.warn("GitHub.processWebhook", details.join(", "), "User not found, won't create subscription")
                    return
                }

                subscription = {id: subId, userId: user.id, dateCreated: now, dateUpdated: now}
            }

            subscription.status = data.action == "cancelled" ? "CANCELLED" : "ACTIVE"
            subscription.monthlyPrice = data.sponsorship.tier.monthly_price_in_dollars

            logger.info("GitHub.processWebhook", details.join(", "))

            // Save updated subscription on the database, and emit event to update the user.
            await database.merge("subscriptions", subscription)
            eventManager.emit("GitHub.subscriptionUpdated", subscription)
        } catch (ex) {
            logger.error("GitHub.processWebhook", `ID ${data.id}`, details.join(", "), ex)
        }
    }
}

// Exports...
export default GitHub.Instance
