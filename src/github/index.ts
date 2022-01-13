// Strautomator Core: GitHub

import {GitHubChangelog} from "./types"
import {axiosRequest} from "../axios"
import database from "../database"
import dayjs from "../dayjs"
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

    // HELPERS
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
}

// Exports...
export default GitHub.Instance
