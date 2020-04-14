import { StravaAPI } from "./api";
import { StravaActivity, StravaGear, StravaProfile, StravaTokens, StravaWebhook } from "./types";
import { UserData } from "../users/types";
/**
 * Strava wrapper.
 */
export declare class Strava {
    private constructor();
    private static _instance;
    static get Instance(): Strava;
    /**
     * Strava API reference.
     */
    api: StravaAPI;
    /**
     * Init the Strava wrapper.
     */
    init: () => Promise<void>;
    /**
     * Get the OAuth2 access token based on the provided authorization code.
     * This method will return null when it fails to get the token.
     * @param code The authorization code provided via the callback URL.
     */
    getToken: (code: string) => Promise<StravaTokens>;
    /**
     * Refresh OAuth2 tokens from Strava.
     */
    refreshToken: (refreshToken: string, accessToken?: string) => Promise<StravaTokens>;
    /**
     * Get profile info for the logged user.
     * @param tokens Strava access tokens.
     */
    getAthlete: (tokens: StravaTokens) => Promise<StravaProfile>;
    /**
     * Get a single activity from Strava.
     * @param tokens Strava access tokens.
     * @param id The activity ID.
     */
    getActivity: (tokens: StravaTokens, id: string | number) => Promise<StravaActivity>;
    /**
     * Get list of activities from Strava.
     * @param tokens Strava access tokens.
     * @param query Query options, currently only supports "since".
     */
    getActivities: (tokens: StravaTokens, query: any) => Promise<StravaActivity[]>;
    /**
     * Get gear details from Strava.
     * @param tokens Strava access tokens.
     * @param id The gear ID string.
     */
    getGear: (tokens: StravaTokens, id: string) => Promise<StravaGear>;
    /**
     * Updates a single activity on Strava.
     * @param tokens Strava access tokens.
     * @param activity The ativity data.
     * @param fields List of fields that should be updated.
     */
    setActivity: (tokens: StravaTokens, activity: StravaActivity) => Promise<void>;
    /**
     * Check a subscription status based on its ID.
     */
    getSubscriptions: () => Promise<StravaWebhook[]>;
    /**
     * Subscribe to activities updates sent by Strava, and return the subscription ID.
     * @param user The relevant user to receive activities from.
     */
    setSubscription: (user: UserData) => Promise<number>;
    /**
     * Cancel a subscription (mostly called when user cancel the account).
     * @param user The user which should have the subscription cancelled.
     */
    cancelSubscription: (user: UserData) => Promise<void>;
    /**
     * Save a processed activity with user and recipe details to the database.
     * @param user The activity's owner.
     * @param activity The Strava activity details.
     * @param recipes Array of triggered recipe IDs.
     */
    saveProcessedActivity: (user: UserData, activity: StravaActivity, recipes: string[]) => Promise<void>;
}
declare const _default: Strava;
export default _default;
