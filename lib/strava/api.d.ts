/**
 * Strava API handler.
 */
export declare class StravaAPI {
    private constructor();
    private static _instance;
    static get Instance(): StravaAPI;
    /**
     * Expose axios to outside modules.
     */
    axios: any;
    /**
     * API limiter module.
     */
    private limiter;
    /**
     * The authentication URL used to start the OAuth2 flow with Strava.
     */
    get authUrl(): string;
    /**
     * Init the Strava API handler.
     */
    init: () => Promise<void>;
    /**
     * Internal implementation to make a request to the Strava API.
     * @param token The user OAuth2 token.
     * @param method HTTP method can be GET or POST.
     * @param path The API path.
     * @param params Additional parameters to be passed, optional.
     * @param body Additional body to be posted with the request.
     */
    private makeRequest;
    /**
     * Make a GET request to Strava.
     * @param token The user OAuth2 token.
     * @param path The API path.
     * @param params Additional parameters to be passed, optional.
     */
    get: (token: string, path: string, params?: any) => Promise<any>;
    /**
     * Make a PUT request to Strava.
     * @param token The user OAuth2 token.
     * @param path The API path.
     * @param params Additional parameters to be passed, optional.
     * @param body Additional body to be posted with the request.
     */
    put: (token: string, path: string, params?: any, body?: any) => Promise<any>;
    /**
     * Make a POST request to Strava.
     * @param token The user OAuth2 token.
     * @param path The API path.
     * @param params Additional parameters to be passed, optional.
     * @param body Additional body to be posted with the request.
     */
    post: (token: string, path: string, params?: any, body?: any) => Promise<any>;
    /**
     * Make a DELETE request to Strava.
     * @param token The user OAuth2 token.
     * @param path The API path.
     * @param params Additional parameters to be passed, optional.
     */
    delete: (token: string, path: string, params?: any) => Promise<any>;
}
declare const _default: StravaAPI;
export default _default;
