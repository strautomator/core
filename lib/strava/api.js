"use strict";
// Strautomator Core: Strava API
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const bottleneck_1 = __importDefault(require("bottleneck"));
const logger = require("anyhow");
const querystring = require("querystring");
const axios = require("axios").default;
const settings = require("setmeup").settings;
const packageVersion = require("../../package.json").version;
/**
 * Strava API handler.
 */
class StravaAPI {
    constructor() {
        /**
         * Expose axios to outside modules.
         */
        this.axios = axios;
        // INIT
        // --------------------------------------------------------------------------
        /**
         * Init the Strava API handler.
         */
        this.init = async () => {
            try {
                if (!settings.strava.api.clientId) {
                    throw new Error("Missing the strava.api.clientId setting");
                }
                if (!settings.strava.api.clientSecret) {
                    throw new Error("Missing the strava.api.clientSecret setting");
                }
                if (!settings.strava.api.verifyToken) {
                    throw new Error("Missing the strava.api.verifyToken setting");
                }
                // Create the bottleneck rate limiter.
                this.limiter = new bottleneck_1.default({
                    maxConcurrent: settings.strava.api.maxConcurrent,
                    reservoir: settings.strava.api.maxPerMinute,
                    reservoirRefreshAmount: settings.strava.api.maxPerMinute,
                    reservoirRefreshInterval: 1000 * 60
                });
                // Catch errors.
                this.limiter.on("error", (err) => {
                    logger.error("StravaAPI.limiter", err);
                });
                // Rate limiting warnings
                this.limiter.on("depleted", () => {
                    logger.warn("StravaAPI.limiter", "Rate limited");
                });
                logger.info("Strava.init", `Max concurrent: ${settings.strava.api.maxConcurrent}, per minute: ${settings.strava.api.maxPerMinute}`);
            }
            catch (ex) {
                logger.error("StravaAPI.init", ex);
                process.exit(37);
            }
        };
        // API REQUEST
        // --------------------------------------------------------------------------
        /**
         * Internal implementation to make a request to the Strava API.
         * @param token The user OAuth2 token.
         * @param method HTTP method can be GET or POST.
         * @param path The API path.
         * @param params Additional parameters to be passed, optional.
         * @param body Additional body to be posted with the request.
         */
        this.makeRequest = async (token, method, path, params, body) => {
            try {
                const options = {
                    url: `${settings.strava.api.baseUrl}${path}`,
                    method: method,
                    headers: { "User-Agent": `${settings.app.title} ${packageVersion}` }
                };
                // Token was passed?
                if (token) {
                    options.headers["Authorization"] = `Bearer ${token}`;
                }
                // Additonal parameters were passed?
                if (params) {
                    options.url += `?${querystring.stringify(params)}`;
                }
                // Body data was passed?
                if (body) {
                    options.data = body;
                }
                // Send request to Strava!
                const res = await this.limiter.schedule({ id: options.path }, () => axios(options));
                if (res == null || res.data == null) {
                    throw new Error("Invalid or empty response");
                }
                return res.data;
            }
            catch (ex) {
                logger.debug("StravaAPI.makeRequest", path, method, ex);
                throw ex;
            }
        };
        /**
         * Make a GET request to Strava.
         * @param token The user OAuth2 token.
         * @param path The API path.
         * @param params Additional parameters to be passed, optional.
         */
        this.get = async (token, path, params) => {
            try {
                return await this.makeRequest(token, "GET", path, params);
            }
            catch (ex) {
                throw ex;
            }
        };
        /**
         * Make a PUT request to Strava.
         * @param token The user OAuth2 token.
         * @param path The API path.
         * @param params Additional parameters to be passed, optional.
         * @param body Additional body to be posted with the request.
         */
        this.put = async (token, path, params, body) => {
            try {
                return await this.makeRequest(token, "PUT", path, params, body);
            }
            catch (ex) {
                throw ex;
            }
        };
        /**
         * Make a POST request to Strava.
         * @param token The user OAuth2 token.
         * @param path The API path.
         * @param params Additional parameters to be passed, optional.
         * @param body Additional body to be posted with the request.
         */
        this.post = async (token, path, params, body) => {
            try {
                return await this.makeRequest(token, "POST", path, params, body);
            }
            catch (ex) {
                throw ex;
            }
        };
        /**
         * Make a DELETE request to Strava.
         * @param token The user OAuth2 token.
         * @param path The API path.
         * @param params Additional parameters to be passed, optional.
         */
        this.delete = async (token, path, params) => {
            try {
                return await this.makeRequest(token, "DELETE", path, params);
            }
            catch (ex) {
                throw ex;
            }
        };
    }
    static get Instance() {
        return this._instance || (this._instance = new this());
    }
    /**
     * The authentication URL used to start the OAuth2 flow with Strava.
     */
    get authUrl() {
        return `${settings.strava.api.authUrl}?client_id=${settings.strava.api.clientId}&redirect_uri=${settings.app.url}auth/callback&response_type=code&scope=${settings.strava.api.scopes}`;
    }
}
exports.StravaAPI = StravaAPI;
// Exports...
exports.default = StravaAPI.Instance;
