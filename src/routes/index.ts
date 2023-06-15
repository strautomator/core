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
                [StravaFitnessLevel.Untrained]: 1.14,
                [StravaFitnessLevel.Average]: 1.06,
                [StravaFitnessLevel.Athletic]: 1.02,
                [StravaFitnessLevel.Pro]: 0.96
            }

            // No total time set? Estimate it now, using different multipliers depending on the user's fitness level.
            if (!route.totalTime) {
                const multiplier = multipliers[user.fitnessLevel || StravaFitnessLevel.Average]
                const secondsEstimated = route.movingTime * multiplier
                const secondsExtraBreaks = Math.floor(route.movingTime / 10800) * settings.routes.extraTimePer3Hours
                const duration = dayjs.duration(secondsEstimated + secondsExtraBreaks, "seconds")
                const toQuarter = 15 - (duration.minutes() % 15)
                route.totalTime = duration.add(toQuarter, "minutes").asSeconds()
            }
        } catch (ex) {
            logger.error("Routes.estimateTotalTime", logHelper.user(user), route.id, ex)
        }
    }
}

// Exports...
export default Routes.Instance
