// Strautomator Core: Garmin Courses

import {UserData} from "../users/types"
import api from "./api"
import _ from "lodash"
import logger from "anyhow"
import * as logHelper from "../loghelper"

/**
 * Garmin courses.
 */
export class GarminCourses {
    private constructor() {}
    private static _instance: GarminCourses
    static get Instance() {
        return this._instance || (this._instance = new this())
    }

    // DATA FROM GARMIN
    // --------------------------------------------------------------------------

    /**
     * Get list of registered courses for the user.
     * @param user User requesting the Garmin courses.
     */
    getCourses = async (user: UserData): Promise<void> => {
        try {
            const tokens = user.garmin.tokens
            const res = await api.makeRequest(tokens, "training-api/courses/v1/course/userCourses")

            return res
        } catch (ex) {
            logger.error("Garmin.getCourses", logHelper.user(user), ex)
            throw ex
        }
    }
}

// Exports...
export default GarminCourses.Instance
