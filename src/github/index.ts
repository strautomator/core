// Strautomator Core: GitHub

import {GitHubChangelog, GitHubSubscription} from "./types"
import api from "./api"
import database from "../database"
import dayjs from "../dayjs"
import eventManager from "../eventmanager"
import subscriptions from "../subscriptions"
import users from "../users"
import _ from "lodash"
import logger from "anyhow"
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
     * Get list of active sponsors. If failed, won't throw an error, but return null instead.
     * TODO! At the moment pagination is not implemented, so only the first 200 sponsors will be returned.
     */
    getActiveSponsors = async (): Promise<Partial<GitHubSubscription>[]> => {
        try {
            const query = `query { user (login: "${settings.github.api.username}") { sponsorshipsAsMaintainer(includePrivate: true, activeOnly: true, #count) { totalCount nodes { createdAt, isOneTimePayment, tierSelectedAt, tier { monthlyPriceInDollars }, sponsorEntity { ... on User { login } }, sponsorEntity { ... on Organization { login } } } } }}`
            const firstQuery = {query: query.replace("#count", "first: 100")}
            const lastQuery = {query: query.replace("#count", "last: 100")}

            const result = await api.graphQL(firstQuery)
            if (result.data?.user?.sponsorshipsAsMaintainer?.totalCount > 100) {
                const lastResult = await api.graphQL(lastQuery)
                result.data.user.sponsorshipsAsMaintainer.nodes = _.concat(result.data.user.sponsorshipsAsMaintainer.nodes, lastResult.data.user.sponsorshipsAsMaintainer.nodes)
            }

            const sponsors: Partial<GitHubSubscription>[] = []

            // Iterate and build the list of active sponsors.
            for (let node of result.data.user.sponsorshipsAsMaintainer.nodes) {
                const dateCreated = dayjs.utc(node.createdAt)
                const dateUpdated = dayjs.utc(node.tierSelectedAt)

                const sub: Partial<GitHubSubscription> = {
                    id: `GH-${node.sponsorEntity.login.toLowerCase()}`,
                    username: node.sponsorEntity.login,
                    price: node.tier.monthlyPriceInDollars,
                    dateCreated: dateCreated.toDate(),
                    dateUpdated: dateUpdated.toDate(),
                    currency: "USD"
                }

                // One time payment? Set the default expiration date.
                if (node.isOneTimePayment) {
                    sub.dateExpiry = dateCreated.add(30, "days").toDate()
                } else {
                    sub.frequency = "monthly"
                }

                sponsors.push(sub)
            }

            logger.info("GitHub.getActiveSponsors", `${sponsors.length} active sponsors`)
            return sponsors
        } catch (ex) {
            logger.error("GitHub.getActiveSponsors", ex)
            return null
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
                        datePublished: dayjs.utc(rel.created_at).toDate()
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

            const now = dayjs.utc()
            const defaultExpiryDate = now.add(30, "days").toDate()

            // Log request body.
            if (data.action) details.push(`Action: ${data.action}`)
            if (data.sender) details.push(`Sender: ${data.sender.login}`)
            if (data.hook) details.push(`Hook: ${data.hook.type}`)
            if (data.sponsorship) {
                details.push(`Sponsor: ${data.sponsorship.sponsor.login}`)
                details.push(`Tier: ${data.sponsorship.tier.name}`)
                details.push(`Amount: ${data.sponsorship.tier.monthly_price_in_dollars} USD`)
            }

            // Abort here if sponsorship webhook is missing crucial data.
            if (!data.action || !data.sponsorship) {
                logger.warn("GitHub.processWebhook", "Missing sponsorship details", details.join(", "))
                return
            }

            const username = data.sponsorship.sponsor.login
            const subId = `GH-${username.toLowerCase()}`
            const status = data.action == "pending_cancellation" ? "SUSPENDED" : data.action == "cancelled" ? "CANCELLED" : "ACTIVE"

            // Check if the subscription data already exists, and if not, create one.
            let subscription: GitHubSubscription = (await subscriptions.getById(subId)) as GitHubSubscription
            if (!subscription) {
                const user = await users.getByUsername(username)

                // Can't create subscription if a user with a similar username was not found.
                if (!user) {
                    logger.warn("GitHub.processWebhook", details.join(", "), "User not found, won't set the subscription's user ID")
                }

                // New subscription details.
                subscription = {
                    source: "github",
                    id: subId,
                    userId: user ? user.id : "notfound",
                    username: username,
                    price: data.sponsorship.tier.monthly_price_in_dollars,
                    status: status
                }

                // One time payment? Set the expiration date.
                if (data.sponsorship.tier.is_one_time) {
                    subscription.dateExpiry = defaultExpiryDate
                }
            } else {
                subscription.status = status
                subscription.dateUpdated = now.toDate()
                subscription.pendingUpdate = true

                // If cancelled, make sure we have an expiry date set.
                if (status != "ACTIVE" && !subscription.dateExpiry) {
                    subscription.dateExpiry = defaultExpiryDate
                }
            }

            // Make sure the expiration date is removed if not a single payment.
            if (!data.sponsorship.tier.is_one_time) {
                delete subscription.dateExpiry
                subscription.frequency = "monthly"
                details.push("Monthly")
            } else {
                delete subscription.frequency
                details.push("One time payment")
            }

            logger.info("GitHub.processWebhook", details.join(", "))

            // Save updated subscription on the database.
            if (subscription.pendingUpdate) {
                await subscriptions.update(subscription)
            } else {
                await subscriptions.create(subscription)
            }

            eventManager.emit("GitHub.subscriptionUpdated", subscription)
        } catch (ex) {
            logger.error("GitHub.processWebhook", `ID ${data.id}`, details.join(", "), ex)
        }
    }
}

// Exports...
export default GitHub.Instance
