// Strautomator Core: GitHub

import {GitHubChangelog, GitHubCommit, GitHubSubscription} from "./types"
import api from "./api"
import cache = require("bitecache")
import database from "../database"
import dayjs from "../dayjs"
import eventManager from "../eventmanager"
import users from "../users"
import _ = require("lodash")
import logger = require("anyhow")
const settings = require("setmeup").settings

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
            cache.setup("github-commits", settings.github.cacheDuration)

            if (!quickStart) {
                this.buildChangelog()
            }
        } catch (ex) {
            logger.error("GitHub.init", ex)
            throw ex
        }
    }

    // METHODS
    // --------------------------------------------------------------------------

    /**
     * Get the list of last commits from the Strautomator repos.
     */
    getLastCommits = async (): Promise<GitHubCommit[]> => {
        try {
            const fromCache = cache.get("github-commits", "last")

            // Cached commits still valid?
            if (fromCache?.length > 0) {
                logger.debug("GitHub.getLastCommits.fromCache", `${fromCache.length} commits`)
                return fromCache
            }

            const since = dayjs().subtract(3, "month").toISOString()
            const coreCommits = await api.getRepoCommits(settings.github.api.coreRepo, since, 10, true)
            const webCommits = await api.getRepoCommits(settings.github.api.repo, since, 10, true)
            const commits = _.concat(coreCommits, webCommits)
            const unsortedResults: GitHubCommit[] = []

            // Build list of last commits.
            for (let c of commits) {
                const arrGitRepo = c.commit.tree.url.replace("https://api.github.com/repos/", "").split("/").slice(0, 2)
                unsortedResults.push({repo: arrGitRepo.join("/"), message: c.commit.message, dateCommited: dayjs(c.commit.committer.date).toDate()})
            }

            const results = _.orderBy(unsortedResults, "dateCommited", "desc")
            cache.set("github-commits", "last", results)
            logger.info("GitHub.getLastCommits", `Last commit on ${dayjs(results[0].dateCommited).format("lll")}`)

            return results
        } catch (ex) {
            logger.error("GitHub.getLastCommits", ex)
            throw ex
        }
    }

    /**
     * Build the application change log based on the repo releases.
     */
    buildChangelog = async (): Promise<void> => {
        try {
            const releases = await api.getRepoReleases(settings.github.api.repo)
            const changelog: GitHubChangelog = {}
            let relevReleases: number = 0

            // Iterate raw releases to build the change log.
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
