// Strautomator Functions: Users

import {UserData} from "strautomator-core"
import core = require("strautomator-core")
import _ from "lodash"
import dayjs from "dayjs"
import dayjsDayOfYear from "dayjs/plugin/dayOfYear"
import logger from "anyhow"
const settings = require("setmeup").settings
dayjs.extend(dayjsDayOfYear)

/**
 * Delete idle users.
 */
export const cleanupIdle = async () => {
    logger.info("F.Users.cleanupIdle.start")

    const idleUsers = await core.users.getIdle()

    try {
        for (const user of idleUsers) {
            if (user.isPro) {
                logger.info("F.Users.cleanupIdle", `Idle user is PRO: ${user.id}`)
            } else {
                logger.info("F.Users.cleanupIdle", `Deleting idle user: ${user.id}`)
                await core.users.delete(user)
            }
        }
    } catch (ex) {
        logger.error("F.Users.cleanupIdle", ex)
    }
}

/**
 * Update the FTP and fitness level of users that have enabled that feature.
 */
export const performanceProcess = async () => {
    logger.info("F.Users.performanceProcess.start")

    try {
        const now = dayjs()
        const where = []
        where.push(["isPro", "==", true])
        where.push(["preferences.ftpAutoUpdate", "==", true])

        // Get and shuffle relevant users.
        let users: UserData[] = _.shuffle(await core.database.search("users", where))
        let totalCount = users.length

        // Filter users to be processed, based on their name and day of year.
        // The idea is to process roughly half of the total users per week.
        users = users.filter((u) => !u.preferences.privacyMode && !u.writeSuspended && (u.profile.firstName || u.profile.lastName).charCodeAt(0) % 2 == now.dayOfYear() % 2)

        if (users.length == 0) {
            return logger.warn("F.Users.performanceProcess", "No users to be updated")
        }

        logger.info("F.Users.performanceProcess", `Will process ${users.length} out of ${totalCount} users`)

        // Helper function to force refresh the user token (if needed) and then process the FTP.
        const processPerformance = async (user: UserData) => {
            try {
                if (now.unix() >= user.stravaTokens.expiresAt) {
                    user.stravaTokens = await core.strava.refreshToken(user.stravaTokens.refreshToken, user.stravaTokens.accessToken)
                }

                // Process the user's FTP and fitness level.
                await core.strava.performance.processPerformance(user)
            } catch (jobEx) {
                logger.error("F.Users.performanceProcess", core.logHelper.user(user), jobEx)
            }
        }

        // Process FTP for the relevant users.
        const batchSize = settings.functions.batchSize
        while (users.length) {
            await Promise.allSettled(users.splice(0, batchSize).map(processPerformance))
        }
    } catch (ex) {
        logger.error("F.Users.performanceProcess", ex)
    }
}

/**
 * Update the fitness level of a subset of recently active users.
 */
export const updateFitnessLevel = async () => {
    logger.info("F.Users.updateFitnessLevel.start")

    try {
        const now = dayjs()
        const batchSize = settings.functions.batchSize
        const dateFrom = now.subtract(settings.strava.fitnessLevel.weeks, "weeks").startOf("day")
        const where = [["dateLastActivity", ">", dateFrom.toDate()]]

        // Helper to fetch and set the fitness level of users.
        const processFitnessLevel = async (user: UserData) => {
            try {
                if (now.unix() >= user.stravaTokens.expiresAt) {
                    user.stravaTokens = await core.strava.refreshToken(user.stravaTokens.refreshToken, user.stravaTokens.accessToken)
                }

                // Check if fitness level has changed, and if so, update the database record.
                const fitnessLevel = await core.strava.performance.estimateFitnessLevel(user)
                if (user.fitnessLevel != fitnessLevel) {
                    user.fitnessLevel = fitnessLevel
                    await core.users.update({id: user.id, displayName: user.displayName, fitnessLevel: fitnessLevel})
                }
            } catch (jobEx) {
                logger.error("F.Users.updateFitnessLevel", core.logHelper.user(user), jobEx)
            }
        }

        // Get recently active users.
        const users: UserData[] = await core.database.search("users", where, null, 500)

        // Now filter up to 100 users that have no fitness level set and process them.
        const allNoLevelUsers = _.remove(users, (u) => !u.fitnessLevel)
        const noLevelUsers = _.sampleSize(allNoLevelUsers, 100)

        // Finally we update the fitness level of 50 random users that didn't have their FTP updated recently,
        // as the standard FTP update procedure already sets the fitness level as well.
        const allRandomUsers = _.remove(users, (u) => !u.ftpStatus || dateFrom.isAfter(u.ftpStatus.dateUpdated))
        const randomUsers = _.sampleSize(allRandomUsers, 50)

        // Process all filtered users.
        logger.info("F.Users.updateFitnessLevel", `Users to process: ${noLevelUsers.length || "none"} with no fitness level set yet, ${randomUsers.length || "none"} randomly chosen`)
        while (noLevelUsers.length) {
            await Promise.allSettled(noLevelUsers.splice(0, batchSize).map(processFitnessLevel))
        }
        while (randomUsers.length) {
            await Promise.allSettled(randomUsers.splice(0, batchSize).map(processFitnessLevel))
        }
    } catch (ex) {
        logger.error("F.Users.updateFitnessLevel", ex)
    }
}

/**
 * Disable automation recipes that failed to execute repeatedly, and notify the user.
 */
export const disableFailingRecipes = async () => {
    logger.info("F.Users.disableFailingRecipes.start")

    try {
        const recipeStats = await core.recipes.stats.getFailingRecipes()
        const updatedUsers: {[id: string]: any} = {}

        // Iterate list of failing recipes to disabled them.
        for (let stat of recipeStats) {
            try {
                const user = await core.users.getById(stat.userId)
                const recipeId = stat?.id.split("-")[1]

                // User not found? Delete stats.
                if (!user) {
                    await core.recipes.stats.deleteStats(user, recipeId)
                    continue
                }

                const recipe = user.recipes[recipeId]

                // Recipe does not exist any longer? Archive the stats.
                if (!recipe) {
                    if (!stat.dateArchived) {
                        logger.warn("F.Users.disableFailingRecipes", core.logHelper.user(user), `Recipe ${recipeId} does not exist`)
                        await core.recipes.stats.archiveStats(user, recipeId)
                    } else {
                        logger.info("F.Users.disableFailingRecipes", core.logHelper.user(user), `Recipe ${recipeId} is archived`)
                    }

                    continue
                }

                // Recipe already disabled? Stop here.
                if (recipe.disabled) {
                    logger.info("F.Users.disableFailingRecipes", core.logHelper.user(user), `Recipe ${recipeId} is already disabled`)
                    continue
                }

                if (!updatedUsers[user.id]) {
                    updatedUsers[user.id] = {id: user.id, recipes: user.recipes}
                }

                // Disable the current recipe.
                if (updatedUsers[user.id].recipes[recipeId]) {
                    updatedUsers[user.id].recipes[recipeId].disabled = true
                    logger.info("F.Users.disableFailingRecipes", core.logHelper.user(user), `Recipe ${recipeId} disabled`)
                } else {
                    logger.warn("F.Users.disableFailingRecipes", core.logHelper.user(user), `Can't find recipe ${recipeId}`)
                }
            } catch (recipeEx) {
                logger.error("F.Users.disableFailingRecipes", `Recipe ${stat.id}`, recipeEx)
            }
        }

        // Save updated users with the disabled recipes.
        for (let user of Object.values(updatedUsers)) {
            await core.users.update(user)
        }
    } catch (ex) {
        logger.error("F.Users.disableFailingRecipes", ex)
    }
}

/**
 * Delete archived stats.
 */
export const deleteArchivedStats = async (): Promise<any> => {
    logger.info("F.Users.deleteArchivedStats")

    try {
        await core.recipes.stats.deleteArchivedStats()
    } catch (ex) {
        logger.error("F.Users.deleteArchivedStats", ex)
    }
}

/**
 * Reset recipe counters for users that have enabled this option.
 */
export const resetRecipeCounters = async () => {
    logger.info("F.Users.resetRecipeCounters.start")

    try {
        const tomorrow = new Date(Date.now() + 3600 * 1000 * 24)
        const users = await core.users.getByResetCounter(tomorrow)

        // Iterate users and reset the recipe counters for each one of them.
        for (let user of users) {
            const recipes = Object.values(user.recipes).filter((r) => !r.counterNoReset)

            for (let recipe of recipes) {
                await core.recipes.stats.setCounter(user, recipe, 0)
            }
        }
    } catch (ex) {
        logger.error("F.Users.resetRecipeCounters", ex)
    }
}

/**
 * Count how many active, PRO and total users.
 */
export const countUsers = async (): Promise<any> => {
    logger.info("F.Users.countUsers")

    try {
        const total = await core.database.count("users")
        const active = total - (await core.database.count("users", ["suspended", "==", true]))
        const pro = await core.database.count("users", ["isPro", "==", true])

        logger.info("F.Users.countUsers", `Total: ${total}`, `Active: ${active}`, `Pro: ${pro}`)
        return {total: total, active: active, pro: pro}
    } catch (ex) {
        logger.error("F.Users.countUsers", ex)
    }
}

/**
 * Count recipe usage details.
 */
export const countRecipeUsage = async (): Promise<any> => {
    logger.info("F.Users.countRecipeUsage")

    try {
        const recipeUsage: any = {}
        const users = await core.users.getActive()

        for (let pl of core.recipes.propertyList) {
            recipeUsage[`condition.${pl.value}`] = _.sum(users.map((u) => Object.values(u.recipes || []).filter((r) => r.conditions.find((rc) => rc.property == pl.value)).length))
        }
        for (let al of core.recipes.actionList) {
            recipeUsage[`action.${al.value}`] = _.sum(users.map((u) => Object.values(u.recipes || []).filter((r) => r.actions.find((ra) => ra.type == al.value)).length))
        }

        logger.info("F.Users.countSubscriptions", `Counted recipe usage for ${users.length} users`)
        return recipeUsage
    } catch (ex) {
        logger.error("F.Users.countRecipeUsage", ex)
    }
}
