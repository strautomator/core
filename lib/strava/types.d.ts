/**
 * An activity on Strava.
 */
export interface StravaActivity {
    /** Activity numeric ID. */
    id: number;
    /** Activity type (Ride, Run, etc). */
    type: StravaSport;
    /** Activity name. */
    name: string;
    /** Activity description or details. */
    description?: string;
    /** Marked as coomute? */
    commute?: boolean;
    /** Start date and time, local time. */
    dateStart: Date;
    /** End date and time, local time. */
    dateEnd: Date;
    /** Total distance in meters. */
    distance?: number;
    /** Total elevation in meters. */
    elevationGain?: number;
    /** Maximum elevation. */
    elevationMax?: number;
    /** Total elapsed time in seconds. */
    totalTime: number;
    /** Elapsed moving time in secods. */
    movingTime: number;
    /** Start location (latitude and longitude). */
    locationStart?: [number, number];
    /** End location (latitude and longitude). */
    locationEnd?: [number, number];
    /** Gear used. */
    gear?: StravaGear;
    /** Suffer score. */
    sufferScore?: number;
    /** Average speed. */
    speedAvg?: number;
    /** Maximum speed. */
    speedMax?: number;
    /** Average watts. */
    wattsAvg?: number;
    /** Weighted average watts. */
    wattsWeighted?: number;
    /** Average cadence. */
    cadenceAvg?: number;
    /** Average temperature. */
    temperature?: number;
    /** Device name. */
    device?: string;
    /** Fields that were updated by Strautomator. */
    updatedFields?: string[];
}
/**
 * Processed activity details to be saved on the database.
 */
export interface StravaProcessedActivity extends StravaActivity {
    /** User details for this activity. */
    user: {
        id: string;
        username: string;
    };
    /** List of recipe IDs. */
    recipes: string[];
}
/**
 * Helper to transform data from the API to a StravaActivity interface.
 * @param data Input data.
 */
export declare function toStravaActivity(data: any): StravaActivity;
/**
 * A Strava gear (bikes and shoes).
 */
export interface StravaGear {
    /** ID of the gear. */
    id: string;
    /** Friendly name set by the user. */
    name: string;
    /** Is it the primary gear for the user? */
    primary: boolean;
}
/**
 * Helper to transform data from the API to a StravaGear interface.
 * @param data Input data.
 */
export declare function toStravaGear(data: any): StravaGear;
/**
 * Strava athlete details.
 */
export interface StravaProfile {
    /** Athlee ID, the same as the user ID stored on the database. */
    id?: string;
    /** Athlete's username. */
    username: string;
    /** Athlete's first name. */
    firstName: string;
    /** Athlete's last name. */
    lastName: string;
    /** Athlete's creation date (on Strava). */
    dateCreated: Date;
    /** Athlete's date of last update (on Strava). */
    dateUpdated: Date;
    /** Athlete's list of registered bikes. */
    bikes?: StravaGear[];
    /** Athlete's list of registered shoes. */
    shoes?: StravaGear[];
    /** URL to the profile avatar. */
    urlAvatar?: string;
}
/**
 * Helper to transform data from the API to a StravaProfile interface.
 * @param data Input data.
 */
export declare function toStravaProfile(data: any): StravaProfile;
/**
 * OAuth2 access and refresh token for a particular user.
 */
export interface StravaTokens {
    /** The OAuth2 access token. */
    accessToken?: string;
    /** The OAuth2 refresh token. */
    refreshToken?: String;
    /** Access token expiry date. */
    expiresAt?: number;
}
/**
 * Represents a subscription (webhook) for events dispatched by Strava.
 */
export interface StravaWebhook {
    /** Subscription ID. */
    id: number;
    /** Callback URL. */
    callbackUrl: string;
    /** Last updated. */
    dateUpdated: Date;
}
/**
 * Strava sport types.
 */
export declare enum StravaSport {
    Ride = "Ride",
    Run = "Run"
}
