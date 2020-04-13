import { UserData } from "./types";
import { StravaProfile, StravaTokens } from "../strava/types";
/**
 * Class to get and process users.
 */
export declare class Users {
    private constructor();
    private static _instance;
    static get Instance(): Users;
    /**
     * Return all users on the database.
     */
    getAll: () => Promise<UserData[]>;
    /**
     * Get users with recipes and that haven't received
     * activity updates on for more than a few days.
     */
    getIdle: () => Promise<UserData[]>;
    /**
     * Get the user by ID.
     * @param id The user's ID.
     */
    getById: (id: string) => Promise<UserData>;
    /**
     * Get the user for the passed access token.
     * @param accessToken The user's plain-text access token.
     */
    getByToken: (accessToken: string) => Promise<UserData>;
    /**
     * Create or update user and save its data on database.
     * @param profile Athlete data returned by the Strava API.
     * @param stravaTokens Access and refresh tokens from Strava.
     */
    upsert: (profile: StravaProfile, stravaTokens: StravaTokens) => Promise<UserData>;
    /**
     * Update the specified user on the database.
     * @param user User to be updated.
     * @param merge Set to true to merge instead of replace data, default is false.
     */
    update: (user: UserData, merge?: boolean) => Promise<void>;
    /**
     * Delete the specified user from the database.
     * @param user User to be deleted.
     */
    delete: (user: UserData) => Promise<void>;
    /**
     * Increment a user's activity count.
     * @param user The user to have activity count incremented.
     */
    setActivityCount: (user: UserData) => Promise<void>;
}
declare const _default: Users;
export default _default;
