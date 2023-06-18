// Strautomator Core: Routes

import {Route} from "./types"
import {StravaFitnessLevel} from "../strava/types"
import {UserData} from "../users/types"
import dayjs from "../dayjs"
import _ from "lodash"
import logger = require("anyhow")
import * as logHelper from "../loghelper"
const settings = require("setmeup").settings

/**
 * Routes processing and utilities.
 */
export class Routes {
    private constructor() {}
    private static _instance: Routes
    static get Instance() {
        return this._instance || (this._instance = new this())
    }

    // MAIN METHODS
    // --------------------------------------------------------------------------

    /**
     * Process routes to add missing data and estimate total times.
     * @param user The user requesting the route details.
     * @param routeUrl The route to be processed.
     */
    process = async (user: UserData, route: Route): Promise<void> => {
        try {
            const multipliers = {
                [StravaFitnessLevel.Untrained]: 1.12,
                [StravaFitnessLevel.Average]: 1.06,
                [StravaFitnessLevel.Athletic]: 1.02,
                [StravaFitnessLevel.Pro]: 0.99,
                [StravaFitnessLevel.Elite]: 0.97
            }
            const breakSplits = {
                [StravaFitnessLevel.Untrained]: 10080,
                [StravaFitnessLevel.Average]: 10800,
                [StravaFitnessLevel.Athletic]: 11160,
                [StravaFitnessLevel.Pro]: 11340,
                [StravaFitnessLevel.Elite]: 11520
            }

            // No total time set? Estimate it now, using different multipliers depending on the user's fitness level.
            // Example: total time for average users will be 6% added to the moving time, plus a break of 40min
            // for every 3 hours of riding (10800) seconds.
            if (!route.totalTime) {
                const multiplier = multipliers[user.fitnessLevel || StravaFitnessLevel.Average]
                const breakSplit = breakSplits[user.fitnessLevel || StravaFitnessLevel.Average]
                const secondsEstimated = route.movingTime * multiplier
                const secondsExtraBreaks = Math.floor(route.movingTime / breakSplit) * settings.routes.breakTime
                const duration = dayjs.duration(secondsEstimated + secondsExtraBreaks, "seconds")
                const toQuarter = 15 - (duration.minutes() % 15)
                route.totalTime = Math.round(duration.add(toQuarter, "minutes").asSeconds())
            }
        } catch (ex) {
            logger.error("Routes.estimateTotalTime", logHelper.user(user), route.id, ex)
        }
    }
}

// Exports...
export default Routes.Instance
