// Strautomator Core: GitHub API

import {AxiosConfig, axiosRequest} from "../axios"
import _ from "lodash"
import logger from "anyhow"
const settings = require("setmeup").settings
const packageVersion = require("../../package.json").version

/**
 * GitHub API handler.
 */
export class GitHubAPI {
    private constructor() {}
    private static _instance: GitHubAPI
    static get Instance() {
        return this._instance || (this._instance = new this())
    }

    /**
     * Make a request to the GitHub API with the given options.
     * @param method Request method.
     * @param path API path.
     * @param body Optional body.
     * @param onlyFirstPage Set to avoid following paginated results.
     */
    private makeRequest = async (method: "GET" | "POST", path: string, body?: any, onlyFirstPage?: boolean): Promise<any> => {
        const options: AxiosConfig = {headers: {}, returnResponse: true}

        // Request options.
        options.method = method
        options.url = `${settings.github.api.baseUrl}${path}`
        options.headers["Authorization"] = `Bearer ${settings.github.api.token}`
        options.headers["User-Agent"] = `${settings.app.title} / ${packageVersion}`

        // Optional body.
        if (body) {
            options.data = body
        }

        try {
            let result = []

            // Follow pagination.
            while (options.url) {
                const res = await axiosRequest(options)
                logger.debug("GitHub.makeRequest", method, options.url)

                options.url = null

                if (!onlyFirstPage && res.data && _.isArray(res.data) && res.headers && res.headers["link"]) {
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

    // INTERNAL API METHODS
    // --------------------------------------------------------------------------

    /**
     * Get the latest commits from the repository on GitHub.
     * @param query Full GraphQL query.
     */
    graphQL = async (query: any): Promise<any> => {
        try {
            const result = await this.makeRequest("POST", "graphql", query)
            return result
        } catch (ex) {
            logger.error("GitHub.graphQL", ex)
            throw ex
        }
    }

    /**
     * Get the latest commits from the repository on GitHub.
     * @param since Optional since date (as string).
     * @param perPage Optional per page, defaults to 100.
     * @param onlyFirstPage Optional, set to true to only get the first page.
     */
    getRepoCommits = async (repo: string, since: string, perPage?: number, onlyFirstPage?: boolean): Promise<any[]> => {
        try {
            if (!perPage) perPage = 100

            const reqPath = `repos/${repo}/commits?per_page=${perPage}&since=${since}`
            const result = await this.makeRequest("GET", reqPath, null, onlyFirstPage)

            return result
        } catch (ex) {
            logger.error("GitHub.getRepoCommits", ex)
            throw ex
        }
    }

    /**
     * Get the releases from the repository on GitHub.
     * @param perPage Optional per page, defaults to 100.
     */
    getRepoReleases = async (repo: string, perPage?: number): Promise<any[]> => {
        try {
            if (!perPage) perPage = 100

            const reqPath = `repos/${repo}/releases?per_page=${perPage}`
            const result = await this.makeRequest("GET", reqPath, null)

            return result
        } catch (ex) {
            logger.error("GitHub.getRepoReleases", ex)
            throw ex
        }
    }
}

// Exports...
export default GitHubAPI.Instance
