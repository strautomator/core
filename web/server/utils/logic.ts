// Shared handlers used by the HTTP API and the MCP tools.

import {fitparser, gearwear, logHelper, recipes, strava, users} from "strautomator-core"
import type {ActivityDebug, FitFileActivity, GearWearConfig, RecipeData, RecipeStatsData, StravaActivity, StravaEstimatedFtp, StravaProcessedActivity, UserData} from "strautomator-core"
import {validateRecipeWebhookActions} from "./urls"
import dayjs from "./dayjs"
import _ from "lodash"
import logger from "anyhow"
import setmeup from "setmeup"
const settings = setmeup.settings

// USER
// --------------------------------------------------------------------------

/**
 * Public user payload returned by GET /api/users/:userId.
 */
export const getPublicUser = async (user: UserData, refresh?: boolean): Promise<any> => {
    let recipeCounter = 0
    for (let recipe of Object.values(user.recipes)) {
        if (!recipe.order) {
            recipe.order = recipeCounter
            recipeCounter++
        }
    }

    if (refresh) {
        const profile = await strava.athletes.getAthlete(user.stravaTokens)

        for (let bike of profile.bikes) {
            const existingBike = _.find(user.profile.bikes, {id: bike.id})
            if (existingBike) _.defaults(bike, existingBike)
        }
        for (let shoes of profile.shoes) {
            const existingShoes = _.find(user.profile.shoes, {id: shoes.id})
            if (existingShoes) _.defaults(shoes, existingShoes)
        }

        const data: Partial<UserData> = {
            id: user.id,
            profile: profile,
            displayName: user.preferences.privacyMode ? user.displayName : profile.username || profile.firstName || profile.lastName
        }
        await users.update(data)
        user.profile = profile
    }

    const result = _.cloneDeep(user)
    if (result.confirmEmail) {
        result.confirmEmail = result.confirmEmail.substring(result.confirmEmail.indexOf(":") + 1)
    }
    if (result.garmin) {
        delete result.garmin.tokens
    }
    if (result.wahoo) {
        delete result.wahoo.tokens
    }
    if (result.spotify) {
        delete result.spotify.tokens
    }

    return result
}

// RECIPES
// --------------------------------------------------------------------------

/**
 * Create, update or delete a user automation (same as POST/DELETE /api/users/:userId/recipes).
 */
export const upsertUserRecipe = async (user: UserData, recipeInput: any, method: string, recipeId?: string): Promise<RecipeData> => {
    const id: string = recipeId || recipeInput?.id
    const recipe: RecipeData = recipeInput?.title ? recipeInput : user.recipes[id]
    if (!recipe) {
        throw Object.assign(new Error(`Recipe ${id} not found`), {status: 404})
    }

    const asJson = recipe ? recipe["asJson"] || false : false
    if (asJson) {
        delete recipe["asJson"]
    }

    if (method != "DELETE") {
        try {
            recipes.validate(user, recipe)
            validateRecipeWebhookActions(recipe)
        } catch (ex) {
            if (asJson && ex.message) {
                ex.message += " (recipe edited as JSON)"
            }
            ex.status = 400
            throw ex
        }
    }

    if (recipe.conditions?.length <= 2 && recipe.samePropertyOp) {
        delete recipe.samePropertyOp
    }

    const operatorLog = !recipe.samePropertyOp || recipe.op == recipe.samePropertyOp ? recipe.op : `${recipe.samePropertyOp} ${recipe.op}`

    if (!recipe.id && method == "POST") {
        if (!user.isPro && user.recipeCount >= settings.plans.free.maxRecipes) {
            throw Object.assign(new Error(`Maximum of ${settings.plans.free.maxRecipes} automations allowed on the free plan`), {status: 402})
        }

        recipe.id = recipes.generateId()
        user.recipes[recipe.id] = recipe
        logger.info("Routes.users", logHelper.user(user), `New recipe ${recipe.id}: ${recipe.title}`, operatorLog, `${recipe.conditions.length} conditions, ${recipe.actions.length} actions`)
    } else {
        const existingRecipe = user.recipes[id]
        if (!existingRecipe) {
            throw Object.assign(new Error(`Recipe ${id} not found`), {status: 404})
        }

        if (method == "POST") {
            user.recipes[recipe.id] = recipe
            logger.info("Routes.users", logHelper.user(user), `Updated recipe ${recipe.id}: ${recipe.title}`, operatorLog, `${recipe.conditions.length} conditions, ${recipe.actions.length} actions`)
        } else if (method == "DELETE") {
            delete user.recipes[id]
            logger.info("Routes.users", logHelper.user(user), `Deleted recipe ${recipeId || id}: ${recipe.title}`)
        } else {
            throw Object.assign(new Error(`Invalid method for recipe ${id}`), {status: 405})
        }
    }

    if (user.suspended) {
        user.suspended = false
    }

    user.recipeCount = Object.keys(user.recipes).length
    await users.update(user, true)
    return recipe
}

/**
 * Automation stats returned by GET /api/users/:userId/recipes/stats[/:recipeId].
 */
export const getRecipeStats = async (user: UserData, recipeId?: string): Promise<RecipeStatsData | RecipeStatsData[]> => {
    if (recipeId) {
        if (!user.recipes[recipeId]) {
            throw new Error(`Invalid recipe: ${recipeId}`)
        }
        return (await recipes.stats.getStats(user, user.recipes[recipeId])) as RecipeStatsData
    }

    const arrStats = (await recipes.stats.getStats(user)) as RecipeStatsData[]
    arrStats.forEach((s) => delete s.activities)
    return arrStats
}

// STRAVA
// --------------------------------------------------------------------------

/**
 * Processed activities returned by GET /api/strava/:userId/processed-activities.
 * Set matchDevices to false to skip Garmin and Wahoo FIT metadata.
 */
export const getProcessedActivities = async (user: UserData, query?: {limit?: any; from?: any; to?: any}, matchDevices = true): Promise<StravaProcessedActivity[]> => {
    const limit: number = query?.limit ? parseInt(query.limit as string) : null
    const dateFrom: Date = query?.from ? dayjs(query.from.toString()).startOf("day").toDate() : null
    const dateTo: Date = query?.to ? dayjs(query.to.toString()).endOf("day").toDate() : null

    const activities = await strava.activityProcessing.getProcessedActivities(user, dateFrom, dateTo, limit)
    if (!matchDevices) {
        return activities
    }

    // Match the FIT file activities in batches, instead of one query per activity.
    if (user.garmin && activities.length > 0) {
        const garminActivities = await fitparser.getMatchingActivities(user, activities, "garmin")
        for (let activity of activities) {
            if (garminActivities[activity.id]) {
                activity.garminActivity = garminActivities[activity.id]
            }
        }
    }
    if (user.wahoo && activities.length > 0) {
        const wahooActivities = await fitparser.getMatchingActivities(user, activities, "wahoo")
        for (let activity of activities) {
            if (wahooActivities[activity.id]) {
                activity.wahooActivity = wahooActivities[activity.id]
            }
        }
    }

    return activities
}

/**
 * Save estimated FTP, same as POST /api/strava/:userId/ftp/estimate.
 */
export const saveEstimatedFtp = async (user: UserData, ftp?: number, estimation?: StravaEstimatedFtp): Promise<any> => {
    estimation = estimation || (await strava.performance.estimateFtp(user))
    if (ftp && ftp > 0) {
        estimation.ftpWatts = parseInt(ftp as any)
    }

    const updated = await strava.performance.saveFtp(user, estimation)
    return updated ? {ftp: estimation.ftpWatts} : false
}

/**
 * Extract activity ID from a number, string, or Strava URL.
 */
export const parseActivityId = (idOrUrl: any): string => {
    if (!idOrUrl) return null
    const str = idOrUrl.toString().trim()
    if (!str || str === "0") return null

    if (/^\d+$/.test(str)) {
        return str
    }

    const match = str.match(/activities\/(\d+)/)
    if (match && match[1] !== "0") {
        return match[1]
    }

    return null
}

/**
 * Get activity debug details.
 */
export const getActivityDebug = async (user: UserData, idOrUrl: string | number): Promise<ActivityDebug> => {
    const activityId = parseActivityId(idOrUrl)
    if (!activityId) {
        throw Object.assign(new Error("Invalid activity ID or URL"), {status: 400})
    }

    let activity: StravaActivity
    try {
        activity = await strava.activities.getActivity(user, activityId)
    } catch (ex) {
        const msg = ex.message || ex.toString().toLowerCase()
        if (msg.includes("not found") || msg.includes("404")) {
            throw Object.assign(new Error("Activity not found"), {status: 404})
        }
        throw ex
    }

    if (!activity) {
        throw Object.assign(new Error("Activity not found"), {status: 404})
    }

    let garminActivity: FitFileActivity = null
    let wahooActivity: FitFileActivity = null
    let processedActivity: StravaProcessedActivity = null

    // Match Garmin and Wahoo parsed FIT data if the user is PRO.
    if (user.isPro) {
        const device = activity.device?.toLowerCase() || ""
        const tasks: Promise<any>[] = []

        if (device.includes("garmin") || user.garmin) {
            tasks.push(
                fitparser
                    .getMatchingActivity(user, activity, "garmin")
                    .then((match) => {
                        if (match) garminActivity = match
                    })
                    .catch((ex) => {
                        logger.warn("Routes.logic.getActivityDebug", logHelper.user(user), `Activity ${activityId}`, "Garmin match failed", ex)
                    })
            )
        }
        if (device.includes("wahoo") || user.wahoo) {
            tasks.push(
                fitparser
                    .getMatchingActivity(user, activity, "wahoo")
                    .then((match) => {
                        if (match) wahooActivity = match
                    })
                    .catch((ex) => {
                        logger.warn("Routes.logic.getActivityDebug", logHelper.user(user), `Activity ${activityId}`, "Wahoo match failed", ex)
                    })
            )
        }
        if (tasks.length > 0) {
            await Promise.allSettled(tasks)
        }
    }

    try {
        const processed = await strava.activityProcessing.getProcessedActivity(user, parseInt(activityId, 10))
        if (processed && (!processed.userId || processed.userId == user.id)) {
            processedActivity = processed
        }
    } catch (innerEx) {
        logger.warn("Routes.logic.getActivityDebug", logHelper.user(user), `Activity ${activityId}`, "Could not get processed activity", innerEx)
    }

    const result: ActivityDebug = {
        activity,
        garminActivity: garminActivity || null,
        wahooActivity: wahooActivity || null,
        processedActivity: processedActivity || null
    }

    return result
}

// GEARWEAR
// --------------------------------------------------------------------------

/**
 * GearWear list returned by GET /api/gearwear/:userId.
 */
export const getGearwearByUser = async (user: UserData, refresh?: boolean): Promise<any> => {
    const result: any = {}
    result.configs = await gearwear.getByUser(user)

    if (user.isPro && (user.garmin?.id || user.wahoo?.id)) {
        const batteryTracker = await gearwear.getBatteryTracker(user)
        if (batteryTracker) {
            result.batteryTracker = batteryTracker
        }
    }

    if (refresh) {
        gearwear.refreshGearDetails(user)
    }

    return result
}

/**
 * Single GearWear payload returned by GET /api/gearwear/:userId/:gearId.
 */
export const getGearwearById = async (user: UserData, gearId: string): Promise<any> => {
    const config = await gearwear.getById(gearId)
    const gear = await strava.athletes.getGear(user, gearId)

    if (config && config.userId != user.id) {
        throw Object.assign(new Error(`${logHelper.user(user)} has no access to GearWear ${gearId}`), {status: 403})
    }

    return {config: config, gear: gear}
}

/**
 * Enable or disable one component on an existing GearWear configuration.
 */
export const toggleGearwearComponent = async (user: UserData, gearId: string, componentName: string, enabled: boolean): Promise<GearWearConfig> => {
    if (typeof enabled != "boolean") {
        throw Object.assign(new Error("enabled must be a boolean"), {status: 400})
    }

    const name = (componentName || "").trim()
    if (!gearId || !name) {
        throw Object.assign(new Error("Missing gear ID or component name"), {status: 400})
    }

    const config = await gearwear.getById(gearId)
    if (!config) {
        throw Object.assign(new Error(`GearWear ${gearId} does not exist`), {status: 404})
    }
    if (config.userId != user.id) {
        throw Object.assign(new Error(`${logHelper.user(user)} has no access to GearWear ${gearId}`), {status: 403})
    }

    const component = _.find(config.components, {name})
    if (!component) {
        throw Object.assign(new Error(`Component "${name}" not found on GearWear ${gearId}`), {status: 404})
    }

    // Already in the requested state.
    if (!!component.disabled == !enabled) {
        return config
    }

    if (enabled) {
        delete component.disabled
    } else {
        component.disabled = true
    }
    gearwear.sortComponents(config)

    return gearwear.upsert(user, config, [component])
}
